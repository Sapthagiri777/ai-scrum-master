import openai
import os
import io
import csv
import requests
from fastapi import FastAPI, HTTPException, Query, Body, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy import create_engine, Column, Integer, Text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from jira import JIRA
from datetime import datetime, timedelta
import chromadb
from sentence_transformers import SentenceTransformer
import yagmail
import threading
import time
from difflib import SequenceMatcher
import json

from dotenv import load_dotenv


load_dotenv()  # take environment variables from .env.

JIRA_URL = os.environ.get("JIRA_URL")
JIRA_EMAIL = os.environ.get("JIRA_EMAIL")
JIRA_TOKEN = os.environ.get("JIRA_TOKEN")


print(os.getcwd())

# ==== NOTIFICATIONS ====
DISCORD_WEBHOOK_URL = os.environ.get("DISCORD_WEBHOOK_URL")
def send_discord(message):
    try:
        requests.post(DISCORD_WEBHOOK_URL, json={"content": message}, timeout=7)
    except Exception as e:
        print(f"[Discord webhook failed]: {e}")

EMAIL_ADDRESS = os.environ.get("EMAIL_ADDRESS")
EMAIL_APP_PASSWORD = os.environ.get("EMAIL_APP_PASSWORD")
TEAM_EMAILS = os.environ.get("TEAM_EMAILS", "email@gmail.com").split(",")

def send_email(subject, content):
    try:
        yag = yagmail.SMTP(EMAIL_ADDRESS, EMAIL_APP_PASSWORD)
        yag.send(to=TEAM_EMAILS, subject=subject, contents=content)
        print(f"[Email sent] {subject}")
    except Exception as e:
        print(f"[Email failed]: {e}")

# ==== DATABASE SETUP ====
DB_PATH = "sqlite:///./standup_history.db"
Base = declarative_base()
class StandupHistory(Base):
    __tablename__ = "standup_history"
    id = Column(Integer, primary_key=True, index=True)
    yesterday = Column(Text)
    today = Column(Text)
    blockers = Column(Text)
    summary = Column(Text)

engine = create_engine(DB_PATH, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base.metadata.create_all(engine)

# ==== VECTOR DB SETUP ====
chroma_client = chromadb.Client()
standup_collection = chroma_client.create_collection(name="standups")
embedder = SentenceTransformer("all-MiniLM-L6-v2")
def add_to_vector_db(item):
    text = f"Yesterday: {item.yesterday}\nToday: {item.today}\nBlockers: {item.blockers}\nSummary: {item.summary}"
    embedding = embedder.encode([text])[0].tolist()
    standup_collection.add(
        ids=[str(item.id)],
        embeddings=[embedding],
        documents=[text],
        metadatas=[{"id": item.id}]
    )

# ==== JIRA CONFIG ====

JIRA_URL = os.environ.get("JIRA_URL")
JIRA_EMAIL = os.environ.get("JIRA_EMAIL")
JIRA_TOKEN = os.environ.get("JIRA_TOKEN")
JIRA_PROJECT = os.environ.get("JIRA_PROJECT", "SCRM")
jira = JIRA(server=JIRA_URL, basic_auth=(JIRA_EMAIL, JIRA_TOKEN))
def get_story_points(issue):
    return getattr(issue.fields, "customfield_10021", 1) or 1
def get_default_board_id():
    boards = jira.boards()
    for board in boards:
        if board.type == "scrum":
            return board.id
    if boards:
        return boards[0].id
    raise Exception("No Jira boards found")
def get_active_sprint_id(board_id):
    sprints = jira.sprints(board_id)
    for sprint in sprints:
        if sprint.state.lower() == "active":
            return sprint.id
    raise Exception("No active Jira sprint found")

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
class StandupData(BaseModel):
    yesterday: str
    today: str
    blockers: str
openai.api_key = os.environ["OPENAI_API_KEY"]

@app.post("/generate-summary")
def generate_summary(data: StandupData):
    prompt = (
        f"Yesterday I: {data.yesterday}\n"
        f"Today I will: {data.today}\n"
        f"Blockers: {data.blockers}\n\n"
        "Write a short, friendly Scrum Master style daily standup summary (less than 4 sentences)."
    )
    try:
        response = openai.chat.completions.create(
            model="gpt-3.5-turbo",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=100,
            temperature=0.7,
        )
        summary = response.choices[0].message.content.strip()
    except Exception as e:
        summary = f"Error from OpenAI: {str(e)}"
    db = SessionLocal()
    standup_item = StandupHistory(
        yesterday=data.yesterday,
        today=data.today,
        blockers=data.blockers,
        summary=summary
    )
    db.add(standup_item)
    db.commit()
    db.refresh(standup_item)
    add_to_vector_db(standup_item)
    db.close()
    send_discord(f"📢 New standup summary added: {summary}")
    send_email("Daily Standup Summary", summary)
    return {
        "summary": summary,
        "input": data
    }

@app.get("/history")
def get_history():
    db = SessionLocal()
    items = db.query(StandupHistory).order_by(StandupHistory.id.desc()).all()
    db.close()
    return [
        {
            "id": item.id,
            "yesterday": item.yesterday,
            "today": item.today,
            "blockers": item.blockers,
            "summary": item.summary,
        }
        for item in items
    ]

@app.delete("/history")
def clear_history():
    db = SessionLocal()
    db.query(StandupHistory).delete()
    db.commit()
    db.close()
    return {"message": "History cleared."}

@app.delete("/history/{item_id}")
def delete_history_item(item_id: int):
    db = SessionLocal()
    item = db.query(StandupHistory).filter(StandupHistory.id == item_id).first()
    if not item:
        db.close()
        raise HTTPException(status_code=404, detail="Item not found")
    db.delete(item)
    db.commit()
    db.close()
    return {"message": f"Deleted item {item_id}."}

@app.get("/jira/issues")
def get_jira_issues():
    board_id = get_default_board_id()
    sprint_id = get_active_sprint_id(board_id)
    issues = jira.search_issues(f'project={JIRA_PROJECT} AND sprint={sprint_id}', maxResults=30)
    return [
        {
            "key": issue.key,
            "summary": issue.fields.summary,
            "status": issue.fields.status.name,
            "assignee": issue.fields.assignee.displayName if issue.fields.assignee else None
        }
        for issue in issues
    ]

@app.post("/jira/update")
def update_jira_card(
    key: str = Body(...),
    status: str = Body(...),
    summary: str = Body(None),
    assignee: str = Body(None)
):
    transitions = jira.transitions(key)
    status_l = status.lower().strip()
    transition_id = None
    for t in transitions:
        if t["name"].lower() == status_l or t["to"]["name"].lower() == status_l:
            transition_id = t["id"]
            break
    if transition_id:
        jira.transition_issue(key, transition_id)
    fields = {}
    if summary:
        fields["summary"] = summary
    if assignee:
        fields["assignee"] = {"name": assignee}
    if fields:
        jira.issue(key).update(fields=fields)
    message = f"✏️ Jira Issue Updated: {key} (Status: {status})"
    send_discord(message)
    send_email("Jira Issue Updated", message)
    return {"result": "updated"}

@app.post("/jira/create")
def create_jira_card(
    summary: str = Body(...),
    description: str = Body(""),
    status: str = Body("To Do"),
    assignee: str = Body(None)
):
    fields = {
        "project": {"key": JIRA_PROJECT},
        "summary": summary,
        "description": description,
        "issuetype": {"name": "Task"},
    }
    if assignee:
        fields["assignee"] = {"name": assignee}
    new_issue = jira.create_issue(fields=fields)
    if status.lower() != "to do":
        transitions = jira.transitions(new_issue.key)
        for t in transitions:
            if t["name"].lower() == status.lower():
                jira.transition_issue(new_issue.key, t["id"])
    message = f"🆕 Jira Issue Created: {new_issue.key} - {summary}"
    send_discord(message)
    send_email("Jira Issue Created", message)
    return {"key": new_issue.key}

@app.post("/jira/delete")
def archive_jira_card(key: str = Body(...)):
    transitions = jira.transitions(key)
    for t in transitions:
        if t["name"].lower() in ["done", "closed"]:
            jira.transition_issue(key, t["id"])
            message = f"🗑️ Jira Issue Archived: {key}"
            send_discord(message)
            send_email("Jira Issue Archived", message)
            return {"archived": key}
    return {"error": "No suitable 'done' transition for this ticket"}

@app.get("/api/burndown")
def api_burndown():
    board_id = get_default_board_id()
    sprint_id = get_active_sprint_id(board_id)
    sprints = jira.sprints(board_id)
    sprint = next((s for s in sprints if s.id == sprint_id), None)
    if not sprint or not hasattr(sprint, 'startDate') or not hasattr(sprint, 'endDate'):
        return {"labels": [], "work_remaining": [], "ideal": [], "error": "Check your sprint ID and that your sprint has start and end date."}
    start = datetime.strptime(sprint.startDate[:10], "%Y-%m-%d")
    end = datetime.strptime(sprint.endDate[:10], "%Y-%m-%d")
    days = (end - start).days + 1
    labels = [(start + timedelta(days=i)).strftime("Day %d") for i in range(days)]
    issues = jira.search_issues(f'project={JIRA_PROJECT} AND sprint={sprint_id}', maxResults=300, expand='changelog')
    daily_remaining = []
    for day in range(days):
        day_dt = start + timedelta(days=day)
        sp_left = 0
        for issue in issues:
            sp = get_story_points(issue)
            closed_dt = None
            for history in getattr(issue.changelog, 'histories', []):
                change_dt = datetime.strptime(history.created[:19], "%Y-%m-%dT%H:%M:%S")
                for item in history.items:
                    if item.field == "status" and item.toString.lower() in ["done", "closed", "resolved"]:
                        if not closed_dt or change_dt < closed_dt:
                            closed_dt = change_dt
            if not closed_dt or closed_dt > day_dt:
                sp_left += sp
        daily_remaining.append(sp_left)
    total = daily_remaining[0] if daily_remaining else 0
    ideal = [int(total - (total/(days-1))*i) if days > 1 else total for i in range(days)]
    return {
        "labels": labels,
        "work_remaining": daily_remaining,
        "ideal": ideal,
    }

@app.get("/api/velocity")
def api_velocity():
    board_id = get_default_board_id()
    sprints = jira.sprints(board_id)
    finished = [s for s in sprints if str(s.state).lower() == "closed"][-4:]
    labels = [s.name for s in finished]
    completed = []
    for s in finished:
        issues = jira.search_issues(f'project={JIRA_PROJECT} AND sprint={s.id} AND status=Done', maxResults=300)
        total = sum(get_story_points(i) for i in issues)
        completed.append(total)
    return {"labels": labels, "completed": completed}

@app.get("/search/standups")
def search_standups(q: str = Query(...)):
    q_embedding = embedder.encode([q])[0].tolist()
    results = standup_collection.query(
        query_embeddings=[q_embedding],
        n_results=5
    )
    return {
        "matches": [
            {"document": doc, "metadata": meta}
            for doc, meta in zip(results["documents"][0], results["metadatas"][0])
        ]
    }

@app.get("/rag/standup")
def rag_standup_answer(q: str = Query(...)):
    q_embedding = embedder.encode([q])[0].tolist()
    results = standup_collection.query(
        query_embeddings=[q_embedding],
        n_results=3
    )
    retrieved_docs = results["documents"][0]
    context = "\n\n".join(retrieved_docs)
    rag_prompt = (
        f"Context: {context}\n\n"
        f"Question: {q}\n"
        "Based on the context above, answer clearly and concisely. If context doesn't fit, say so."
    )
    try:
        response = openai.chat.completions.create(
            model="gpt-3.5-turbo",
            messages=[{"role": "user", "content": rag_prompt}],
            max_tokens=180,
            temperature=0.6,
        )
        answer = response.choices[0].message.content.strip()
    except Exception as e:
        answer = f"Error from OpenAI: {str(e)}"
    return {"question": q, "answer": answer, "context_used": retrieved_docs}

@app.get("/standup/suggest")
def suggest_standup():
    board_id = get_default_board_id()
    sprint_id = get_active_sprint_id(board_id)
    issues = jira.search_issues(f'project={JIRA_PROJECT} AND sprint={sprint_id}', maxResults=20)
    yesterday = []
    today = []
    blockers = []
    for issue in issues:
        status = (issue.fields.status.name or "").strip().lower()
        summary = f"{issue.key}: {issue.fields.summary}"
        if status == "done":
            yesterday.append(summary)
        if status == "in progress":
            today.append(summary)
        if status == "to do":
            today.append(summary)
        if status == "blocked":
            blockers.append(summary)
    return {
        "yesterday": "; ".join(yesterday) or "No completed issues yet.",
        "today": "; ".join(today) or "No active issues for today.",
        "blockers": "; ".join(blockers) or "None"
    }

# ==== DAILY EMAIL SUMMARY THREAD ====
def email_daily_standup():
    while True:
        now = datetime.now()
        if now.hour == 10 and now.minute == 0:
            db = SessionLocal()
            standup = db.query(StandupHistory).order_by(StandupHistory.id.desc()).first()
            db.close()
            if standup and standup.summary:
                sub = f"[Daily Standup] {now:%Y-%m-%d}"
                send_email(sub, standup.summary)
                send_discord(f"[Daily Standup] {standup.summary}")
            else:
                print("No standup summary found for today")
        time.sleep(60)
threading.Thread(target=email_daily_standup, daemon=True).start()

# === CSV EXPORT, BOARD, BACKLOG ===
@app.get("/history_csv")
def history_csv():
    try:
        db = SessionLocal()
        items = db.query(StandupHistory).all()
        db.close()
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(["id", "yesterday", "today", "blockers", "summary"])
        for item in items:
            writer.writerow([
                str(item.id),
                str(item.yesterday or ""),
                str(item.today or ""),
                str(item.blockers or ""),
                str(item.summary or "")
            ])
        output.seek(0)
        return Response(content=output.read(), media_type="text/csv")
    except Exception as e:
        return Response(content=f"ERROR: {str(e)}", media_type="text/plain")

@app.get("/jira/issues_csv")
def export_jira_issues_csv():
    issues = jira.search_issues(f'project={JIRA_PROJECT}', maxResults=300)
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["key", "summary", "status", "assignee"])
    for issue in issues:
        writer.writerow([
            issue.key,
            getattr(issue.fields, "summary", ""),
            getattr(issue.fields.status, "name", ""),
            getattr(issue.fields.assignee, "displayName", "") if issue.fields.assignee else ""
        ])
    output.seek(0)
    return Response(content=output.read(), media_type="text/csv")

@app.get("/backlog_csv")
def backlog_csv():
    board_id = get_default_board_id()
    jql = f'project={JIRA_PROJECT} AND status="To Do" AND sprint is EMPTY'
    issues = jira.search_issues(jql, maxResults=75, fields="summary,description")
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["key", "summary", "description"])
    for issue in issues:
        writer.writerow([
            issue.key, getattr(issue.fields, "summary", ""),
            getattr(issue.fields, "description", "") or ""
        ])
    output.seek(0)
    return Response(content=output.read(), media_type="text/csv")

# == BACKLOG AND GROOMING ENDPOINTS, AS BEFORE... ==

@app.get('/backlog')
def get_backlog():
    board_id = get_default_board_id()
    jql = f'project={JIRA_PROJECT} AND status="To Do" AND sprint is EMPTY'
    issues = jira.search_issues(jql, maxResults=75, fields="summary,description")
    return [
        {
            "key": issue.key,
            "summary": issue.fields.summary,
            "description": (issue.fields.description or ""),
        }
        for issue in issues
    ]

@app.post('/backlog/ai_suggestion')
def backlog_ai_suggestion(key: str = Body(...), summary: str = Body(...), description: str = Body("")):
    prompt = f"""
You are an agile Jira coach. Perform the following on the ticket below:
1. If unclear or missing info, propose a better summary/description.
2. Suggest clear acceptance criteria as a bullet list if missing.
3. Estimate type (Bug/Feature/Chore), effort (1/2/3/5/8), and a value/effort priority (Low/Medium/High).
4. Output JSON with keys clarification, acceptance_criteria, type, effort, priority.
Ticket summary: {summary}
Description: {description}
"""
    response = openai.chat.completions.create(
        model="gpt-3.5-turbo",
        messages=[{"role": "user", "content": prompt}],
        max_tokens=250,
        temperature=0.5
    )
    try:
        ai_json = json.loads(response.choices[0].message.content)
    except Exception:
        ai_json = {"clarification": response.choices[0].message.content.strip()}
    send_discord(f"AI grooming suggestion for {key} requested.")
    return ai_json

@app.post('/backlog/duplicates')
def backlog_duplicates(key: str = Body(...), summary: str = Body(...)):
    backlog = [t for t in get_backlog() if t["key"] != key]
    results = []
    for t in backlog:
        score = SequenceMatcher(None, summary.lower(), t["summary"].lower()).ratio()
        if score > 0.65:
            results.append({"key": t["key"], "summary": t["summary"], "score": round(score,2)})
    return {"duplicates": results}

@app.post("/backlog/apply_suggestion")
def backlog_apply_suggestion(
    key: str = Body(...),
    new_summary: str = Body(None),
    new_description: str = Body(None),
    status: str = Body(None)
):
    try:
        fields = {}
        if new_summary:
            new_summary = new_summary.replace('\n', ' ').replace('\r', ' ')
            if len(new_summary) > 255:
                new_summary = new_summary[:252] + "..."
            fields["summary"] = new_summary
        if new_description:
            fields["description"] = new_description

        print(f"Jira update: issue={key} fields={fields} status={status}")

        if fields:
            jira.issue(key).update(fields=fields)
            print(f"Jira fields updated for {key}")

        if status:
            transitions = jira.transitions(key)
            print(f"Transitions available: {[t['name'] for t in transitions]}")
            for t in transitions:
                if t["name"].lower() == status.lower():
                    jira.transition_issue(key, t["id"])
                    print(f"Jira ticket {key} transitioned to {status}")

        send_discord(f"AI suggestion applied on {key}.")
        return {"updated": key}
    except Exception as e:
        print(f"Jira update error: {e}")
        send_discord(f"Error updating {key}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"JIRA update error: {str(e)}")

# === SPRINT ANALYTICS ENDPOINT FOR REPORTS PAGE ===
@app.get("/stats")
def stats():
    issues = jira.search_issues(f'project={JIRA_PROJECT}', maxResults=200)
    done = sum(1 for i in issues if getattr(i.fields.status, "name", "").lower() == "done")
    avg_age = (sum(
        (datetime.now() - datetime.strptime(getattr(i.fields, "created", "")[:19], "%Y-%m-%dT%H:%M:%S")).days
        for i in issues
    ) / len(issues)) if issues else 0
    blockers = [getattr(i.fields, "summary", "") for i in issues if "blocker" in (getattr(i.fields, "summary", "") or "").lower()]
    common_blocker = max(set(blockers), key=blockers.count) if blockers else "None"
    ai_summary = f"Sprint health: {done}/{len(issues)} done. Most common blocker: {common_blocker}."
    return {
        "total_issues": len(issues),
        "done": done,
        "avg_age": round(avg_age, 2),
        "common_blocker": common_blocker,
        "ai_summary": ai_summary
    }

# ... (all your previous imports and definitions remain)

@app.get("/standup/suggest")
def suggest_standup():
    board_id = get_default_board_id()
    sprint_id = get_active_sprint_id(board_id)
    sprint_issues = jira.search_issues(f'project={JIRA_PROJECT} AND sprint={sprint_id}', maxResults=50)
    backlog_issues = jira.search_issues(f'project={JIRA_PROJECT} AND status="To Do" AND sprint is EMPTY', maxResults=75)

    yesterday = []
    today = []
    blockers = []
    backlog_today = []

    for issue in sprint_issues:
        status = (issue.fields.status.name or "").strip().lower()
        summary = f"{issue.key}: {issue.fields.summary}"
        if status == "done":
            yesterday.append(summary)
        if status == "in progress":
            today.append(summary)
        if status == "to do":
            today.append(summary)
        if status == "blocked":
            blockers.append(summary)
    for issue in backlog_issues:
        backlog_today.append(f"{issue.key}: {issue.fields.summary}")

    return {
        "yesterday": "; ".join(yesterday) or "No completed issues yet.",
        "today": "; ".join(today) or "No active issues for today.",
        "blockers": "; ".join(blockers) or "None",
        "upcoming_backlog": "; ".join(backlog_today) or "No unscheduled backlog cards"
    }

@app.post("/backlog/move_to_sprint")
def move_to_sprint(key: str = Body(...)):
    board_id = get_default_board_id()
    sprint_id = get_active_sprint_id(board_id)
    try:
        # Add issue to sprint
        jira.add_issues_to_sprint(sprint_id, [key])
        return {"result": f"Issue {key} moved to sprint!"}
    except Exception as e:
        return {"error": str(e)}
