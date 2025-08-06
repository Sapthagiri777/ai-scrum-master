import React, { useState, useEffect } from "react";
import {
  ChakraProvider,
  Box,
  Flex,
  VStack,
  Heading,
  Button,
  Text,
  Badge,
  useColorMode,
  useColorModeValue,
  IconButton,
  Avatar,
  Switch,
  FormControl,
  FormLabel,
  Spinner,
  useToast,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalCloseButton,
  Input,
  Textarea
} from "@chakra-ui/react";
import { FaSun, FaMoon, FaRocket, FaCog, FaRegListAlt, FaChartBar, FaTachometerAlt, FaTasks } from "react-icons/fa";
import { motion } from "framer-motion";
import { Line, Bar } from "react-chartjs-2";
import { Chart, LineElement, PointElement, LinearScale, Title, CategoryScale, BarElement, Tooltip, Legend } from "chart.js";
Chart.register(LineElement, PointElement, LinearScale, Title, CategoryScale, BarElement, Tooltip, Legend);

const MotionBox = motion(Box);

const MENU = [
  { label: "Dashboard", icon: <FaTachometerAlt /> },
  { label: "Board", icon: <FaRegListAlt /> },
  { label: "Backlog", icon: <FaTasks /> },
  { label: "Standup", icon: <FaRocket /> },
  { label: "Reports", icon: <FaChartBar /> },
  { label: "Settings", icon: <FaCog /> },
];

// ---- Sidebar ----
function Sidebar({ page, setPage, toggleColorMode, colorMode }) {
  return (
    <MotionBox
      bg={useColorModeValue("blue.800", "gray.800")}
      color="white"
      minW="220px"
      py={8}
      px={6}
      boxShadow="2xl"
      as="nav"
      initial={{ x: -60, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
    >
      <Flex align="center" justify="space-between" mb={8}>
        <Heading fontSize="2xl" letterSpacing="2px">Scrum Master</Heading>
        <IconButton
          aria-label="Toggle light/dark mode"
          icon={colorMode === "light" ? <FaMoon /> : <FaSun />}
          onClick={toggleColorMode}
          variant="ghost"
          color="white"
        />
      </Flex>
      <VStack align="stretch" spacing={4}>
        {MENU.map((item, idx) => (
          <Button
            key={item.label}
            leftIcon={item.icon}
            variant={page === idx ? "solid" : "ghost"}
            colorScheme="blue"
            w="100%"
            size="lg"
            borderRadius="md"
            fontWeight="bold"
            fontSize="lg"
            aria-current={page === idx ? "page" : undefined}
            _hover={{
              bg: "blue.700",
              color: "white",
              transform: "translateX(6px)",
              shadow: "lg"
            }}
            onClick={() => setPage(idx)}
            isActive={page === idx}
          >
            {item.label}
          </Button>
        ))}
      </VStack>
    </MotionBox>
  );
}

function MotionSection({ children }) {
  return (
    <MotionBox
      as="main"
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -24 }}
      transition={{ duration: 0.5, ease: "easeInOut" }}
      w="100%"
    >
      {children}
    </MotionBox>
  );
}

// ---- Comments hooks ----
function useComments() {
  const [comment, setComment] = useState("");
  const [commentHistory, setCommentHistory] = useState(() =>
    JSON.parse(localStorage.getItem("comments") || "{}")
  );
  function handleAddComment(issueKey) {
    if (!comment) return;
    const updated = {
      ...commentHistory,
      [issueKey]: [...(commentHistory[issueKey] || []), comment]
    };
    setCommentHistory(updated);
    setComment("");
    localStorage.setItem("comments", JSON.stringify(updated));
  }
  return { comment, setComment, commentHistory, handleAddComment };
}

// ---- Dashboard ----
function Dashboard() {
  const protipBg = useColorModeValue("white", "gray.800");
  const [burndownData, setBurndownData] = useState(null);
  const [velocityData, setVelocityData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const toast = useToast();
  useEffect(() => {
    setIsLoading(true);
    Promise.all([
      fetch("http://127.0.0.1:8000/api/burndown")
        .then(r => r.json())
        .then(res => setBurndownData({
          labels: res.labels,
          datasets: [
            {
              label: "Work Remaining",
              data: res.work_remaining,
              fill: false,
              borderColor: "#3182ce",
              backgroundColor: "#3182ce22",
              tension: 0.2,
              pointRadius: 5,
              pointHoverRadius: 8,
              cubicInterpolationMode: "monotone",
            },
            {
              label: "Ideal",
              data: res.ideal,
              fill: false,
              borderDash: [8, 4],
              borderColor: "#718096",
              backgroundColor: "#CBD5E1",
              tension: 0.1
            }
          ],
        })).catch(() => toast({ title: "Failed to load burndown.", status: "error" })),
      fetch("http://127.0.0.1:8000/api/velocity")
        .then(r => r.json())
        .then(res => setVelocityData({
          labels: res.labels,
          datasets: [
            {
              label: "Story Points Completed",
              backgroundColor: "#0bc5ea",
              borderColor: "#2b6cb0",
              data: res.completed
            }
          ]
        })).catch(() => toast({ title: "Failed to load velocity.", status: "error" }))
    ]).finally(() => setIsLoading(false));
  }, [toast]);
  return (
    <MotionSection>
      <Heading mb={2} color="blue.700">🟦 Team Dashboard</Heading>
      <Text fontSize="xl" color="blue.600" mb={4}>
        View sprint progress and team velocity in real-time.
      </Text>
      <Flex gap={8} flexWrap="wrap">
        <Box bg={protipBg} p={5} borderRadius="xl" boxShadow="lg" w="410px" minH="340px">
          <Heading size="md" mb={2}>Burndown Chart</Heading>
          {burndownData
            ? <Line data={burndownData} options={{
                plugins: { legend: { display: true } },
                scales: { x: { grid: { display: false } }, y: { beginAtZero: true, grid: { display: true } } }
              }} />
            : isLoading ? <Flex justify="center" align="center" h="260px"><Spinner size="xl" /></Flex> : <Text>No data.</Text>
          }
        </Box>
        <Box bg={protipBg} p={5} borderRadius="xl" boxShadow="lg" w="410px" minH="340px">
          <Heading size="md" mb={2}>Velocity Chart</Heading>
          {velocityData
            ? <Bar data={velocityData} options={{
                plugins: { legend: { display: false } },
                scales: { x: { grid: { display: false } }, y: { beginAtZero: true, grid: { display: true } } }
              }} />
            : isLoading ? <Flex justify="center" align="center" h="260px"><Spinner size="xl" /></Flex> : <Text>No data.</Text>
          }
        </Box>
        <Box flex="1" minW="250px" bg={protipBg} p={5} borderRadius="xl" boxShadow="lg">
          <Heading size="md" mb={2}>Sprint Health</Heading>
          <Text mb={2}>Sprint: <b>Jira-Connected</b></Text>
          <Text fontSize="sm" color="gray.500">Data loads live from your Jira backend!</Text>
        </Box>
      </Flex>
    </MotionSection>
  );
}

// ---- Kanban Board ----
function JiraBoard({ reloadKey }) {
  const [columns, setColumns] = useState({ "To Do": [], "In Progress": [], "Done": [] });
  const [editIssue, setEditIssue] = useState(null);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [newCard, setNewCard] = useState({ summary: "", description: "" });
  const toast = useToast();

  const colColors = {
    "To Do": { bg: "blue.50", head: "blue.500", badge: "blue" },
    "In Progress": { bg: "yellow.50", head: "yellow.500", badge: "yellow" },
    "Done": { bg: "green.50", head: "green.600", badge: "green" },
  };
  const cardBg = useColorModeValue("white", "gray.700");

  function reload() {
    fetch("http://127.0.0.1:8000/jira/issues")
      .then(res => res.json())
      .then(issues => {
        const byCol = { "To Do": [], "In Progress": [], "Done": [] };
        issues.forEach(issue => {
          const status = (issue.status || "").toLowerCase().replace(/\s+/g, ' ').trim();
          if (status === "to do") byCol["To Do"].push(issue);
          else if (status === "in progress") byCol["In Progress"].push(issue);
          else if (status === "done") byCol["Done"].push(issue);
          else byCol["To Do"].push(issue);
        });
        setColumns(byCol);
      });
  }
  useEffect(() => { reload(); }, [reloadKey]); // Note reloadKey here!

  const { comment, setComment, commentHistory, handleAddComment } = useComments();

  function handleMove(issue, nextCol) {
    fetch("http://127.0.0.1:8000/jira/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: issue.key, status: nextCol }),
    }).then(reload);
  }

  function openAddCard() { setNewCard({ summary: "", description: "" }); setAddModalOpen(true); }
  function closeAddCard() { setAddModalOpen(false); setNewCard({ summary: "", description: "" }); }
  function submitAddCard() {
    if (newCard.summary) {
      fetch("http://127.0.0.1:8000/jira/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ summary: newCard.summary, description: newCard.description, status: "To Do" }),
      }).then(() => { reload(); closeAddCard(); });
    }
  }
  function handleArchive(issue) {
    if (window.confirm("Are you sure you want to archive this issue?")) {
      fetch("http://127.0.0.1:8000/jira/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: issue.key }),
      }).then(() => { reload(); toast({ title: "Issue archived!", status: "success" }) });
    }
  }
  function renderAvatar(assignee) {
    if (!assignee) return <Avatar size="sm" name="Unassigned" />;
    return <Avatar size="sm" name={assignee} />;
  }
  function openEditModal(issue) { setEditIssue({ ...issue }); }
  function closeEditModal() { setEditIssue(null); }
  function handleEditSave() {
    fetch("http://127.0.0.1:8000/jira/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        key: editIssue.key,
        summary: editIssue.summary,
        description: editIssue.description,
        status: editIssue.status,
        assignee: editIssue.assignee
      }),
    }).then(() => {
      toast({ title: "Issue updated!", status: "success" });
      closeEditModal();
      reload();
    });
  }
  return (
    <MotionSection>
      <Heading mb={6} color="blue.700">Kanban Board</Heading>
      <Flex mb={6} gap={2}>
        <Button colorScheme="blue" onClick={openAddCard}>+ Add Card</Button>
        <Button colorScheme="green" ml={2} onClick={() => window.open("http://127.0.0.1:8000/jira/issues_csv")}>
          Export Board as CSV
        </Button>
      </Flex>
      <Flex gap={5} align="flex-start" w="100%" wrap="wrap">
        {["To Do", "In Progress", "Done"].map((col) => (
          <Box
            key={col}
            minW="270px"
            flex={1}
            bg={colColors[col].bg}
            borderRadius="xl"
            boxShadow="lg"
            p={4}
            transition="background 0.2s"
          >
            <Heading size="md" mb={3} color={colColors[col].head}>{col}</Heading>
            <VStack spacing={4}>
              {columns[col].map((issue) => (
                <Box
                  key={issue.key}
                  p={3}
                  w="100%"
                  bg={cardBg}
                  borderRadius="md"
                  boxShadow="md"
                  borderLeftWidth={4}
                  borderLeftColor={colColors[col].head}
                  transition="box-shadow 0.2s"
                >
                  <Flex justify="space-between" align="center" mb={1}>
                    <Text fontWeight="bold">{issue.key}: {issue.summary}</Text>
                    {renderAvatar(issue.assignee)}
                  </Flex>
                  <Badge colorScheme={colColors[col].badge}>{issue.status}</Badge>
                  <Text fontSize="sm" color="gray.600">
                    {issue.assignee ? "Assigned: " + issue.assignee : "Unassigned"}
                  </Text>
                  <Text fontSize="sm" color="gray.700" mt={2}>
                    {issue.description}
                  </Text>
                  <Flex gap={2} mt={2}>
                    {["To Do", "In Progress", "Done"].filter(c => c !== col).map(nextCol => (
                      <Button
                        key={nextCol}
                        size="xs"
                        colorScheme={colColors[nextCol].badge}
                        variant="outline"
                        onClick={() => handleMove(issue, nextCol)}
                      >
                        Move to {nextCol}
                      </Button>
                    ))}
                    <Button
                      size="xs"
                      colorScheme="blue"
                      variant="outline"
                      onClick={() => openEditModal(issue)}
                    >
                      Edit
                    </Button>
                    {col !== "Done" &&
                      <Button
                        size="xs"
                        colorScheme="red"
                        variant="ghost"
                        onClick={() => handleArchive(issue)}
                      >
                        Archive
                      </Button>
                    }
                  </Flex>
                  {/* --- Comment/discussion for this card --- */}
                  <Box mt={2}>
                    <Input
                      placeholder="Add comment"
                      size="sm"
                      value={comment}
                      onChange={e => setComment(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === "Enter" && comment) handleAddComment(issue.key);
                      }}
                      aria-label={`Add comment to ${issue.key}`}
                      width="85%"
                      mr={2}
                    />
                    <Button size="xs" onClick={() => handleAddComment(issue.key)} disabled={!comment}>Add</Button>
                    {!!commentHistory[issue.key]?.length && (
                      <VStack align="start" mt={1}>
                        {commentHistory[issue.key].map((c, idx) => (
                          <Box key={idx} p={2} bg="gray.50" borderRadius="md" w="100%">
                            <Text fontSize="xs">{c}</Text>
                          </Box>
                        ))}
                      </VStack>
                    )}
                  </Box>
                </Box>
              ))}
            </VStack>
          </Box>
        ))}
      </Flex>
      {/* Add Card Modal */}
      <Modal isOpen={addModalOpen} onClose={closeAddCard}>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Add New Card</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <FormControl>
              <FormLabel>Summary</FormLabel>
              <Input value={newCard.summary} onChange={e => setNewCard(c => ({ ...c, summary: e.target.value }))} />
            </FormControl>
            <FormControl mt={2}>
              <FormLabel>Description</FormLabel>
              <Textarea value={newCard.description} onChange={e => setNewCard(c => ({ ...c, description: e.target.value }))} />
            </FormControl>
          </ModalBody>
          <ModalFooter>
            <Button colorScheme="blue" mr={3} onClick={submitAddCard}>Add Card</Button>
            <Button onClick={closeAddCard}>Cancel</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
      {/* Edit Issue Modal */}
      <Modal isOpen={!!editIssue} onClose={closeEditModal}>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Edit Issue</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <FormControl>
              <FormLabel>Summary</FormLabel>
              <Input value={editIssue?.summary || ''} onChange={e => setEditIssue(s => ({ ...s, summary: e.target.value }))} />
            </FormControl>
            <FormControl mt={2}>
              <FormLabel>Description</FormLabel>
              <Textarea value={editIssue?.description || ''} onChange={e => setEditIssue(s => ({ ...s, description: e.target.value }))} />
            </FormControl>
            <FormControl mt={2}>
              <FormLabel>Status</FormLabel>
              <Input value={editIssue?.status || ''} onChange={e => setEditIssue(s => ({ ...s, status: e.target.value }))} />
            </FormControl>
            <FormControl mt={2}>
              <FormLabel>Assignee</FormLabel>
              <Input value={editIssue?.assignee || ''} onChange={e => setEditIssue(s => ({ ...s, assignee: e.target.value }))} />
            </FormControl>
          </ModalBody>
          <ModalFooter>
            <Button colorScheme="blue" mr={3} onClick={handleEditSave}>Save</Button>
            <Button onClick={closeEditModal}>Cancel</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </MotionSection>
  );
}

// ---- Backlog Grooming (CRUD + Comments + Export) ----
function BacklogGrooming({ setReloadKey }) {
  const [backlog, setBacklog] = useState([]);
  const [aiResults, setAiResults] = useState({});
  const [dupes, setDupes] = useState({});
  const [selectedKey, setSelectedKey] = useState(null);
  const [editTicket, setEditTicket] = useState(null);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [newCard, setNewCard] = useState({ summary: "", description: "" });
  const [commentDrafts, setCommentDrafts] = useState(() =>
    JSON.parse(localStorage.getItem("commentDrafts") || "{}")
  );
  const [commentHistory, setCommentHistory] = useState(() =>
    JSON.parse(localStorage.getItem("comments") || "{}")
  );
  const toast = useToast();

  useEffect(() => { reload(); }, []);
  useEffect(() => { localStorage.setItem("commentDrafts", JSON.stringify(commentDrafts)); }, [commentDrafts]);
  useEffect(() => { localStorage.setItem("comments", JSON.stringify(commentHistory)); }, [commentHistory]);

  const reload = () => {
    fetch("http://127.0.0.1:8000/backlog")
      .then(res => res.json())
      .then(setBacklog);
  };

  const getAISuggestion = (key, summary, description) => {
    fetch("http://127.0.0.1:8000/backlog/ai_suggestion", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, summary, description }),
    })
      .then((r) => r.json())
      .then((result) => setAiResults((r) => ({ ...r, [key]: result })));
  };


  const applySuggestion = (key, ai) => {
    fetch("http://127.0.0.1:8000/backlog/apply_suggestion", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        key,
        new_summary: ai.clarification,
        new_description: ai.acceptance_criteria,
        status: ai.status || undefined,
      }),
    }).then(() => toast({ title: "Suggestion applied!", status: "success" }));
  };

  const autoGroomAll = () => {
    backlog.forEach(t =>
      getAISuggestion(t.key, t.summary, t.description)
    );
    toast({ title: "AI Grooming started on all! Suggestions will appear.", status: "info" });
  };

  function openAddCard() { setNewCard({ summary: "", description: "" }); setAddModalOpen(true); }
  function closeAddCard() { setAddModalOpen(false); setNewCard({ summary: "", description: "" }); }
  function submitAddCard() {
    if (newCard.summary) {
      fetch("http://127.0.0.1:8000/jira/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ summary: newCard.summary, description: newCard.description, status: "To Do" }),
      }).then(() => { reload(); closeAddCard(); });
    }
  }

  function openEditModal(ticket) { setEditTicket({ ...ticket }); }
  function closeEditModal() { setEditTicket(null); }
  function handleEditSave() {
    fetch("http://127.0.0.1:8000/jira/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        key: editTicket.key,
        summary: editTicket.summary,
        description: editTicket.description,
        status: "To Do"
      }),
    }).then(() => {
      toast({ title: "Ticket updated!", status: "success" });
      closeEditModal();
      reload();
    });
  }

  function handleArchive(ticket) {
    if(window.confirm("Are you sure you want to archive this issue?")) {
      fetch('http://127.0.0.1:8000/jira/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: ticket.key }),
      }).then(() => {
        reload();
        toast({ title: 'Ticket archived!', status: 'success' });
      });
    }
  }

  function handleAddComment(issueKey) {
    const comment = commentDrafts[issueKey];
    if (!comment) return;
    const updatedHistory = {
      ...commentHistory,
      [issueKey]: [...(commentHistory[issueKey] || []), comment]
    };
    setCommentHistory(updatedHistory);
    setCommentDrafts(d => ({ ...d, [issueKey]: "" }));
    localStorage.setItem("comments", JSON.stringify(updatedHistory));
    localStorage.setItem("commentDrafts", JSON.stringify({ ...commentDrafts, [issueKey]: "" }));
  }

  return (
    <Box maxW="900px" mx="auto" mt={7}>
      <Heading mb={3} color="blue.700">AI Backlog Grooming</Heading>
      <Flex mb={6} gap={2}>
        <Button colorScheme="green" onClick={autoGroomAll}>Auto Groom All</Button>
        <Button colorScheme="blue" onClick={openAddCard}>+ Add Card</Button>
        <Button colorScheme="green" ml={2} onClick={() => window.open("http://127.0.0.1:8000/backlog_csv")}>
          Export Backlog as CSV
        </Button>
      </Flex>
      <VStack align="stretch" spacing={10}>
        {backlog.map((ticket) => (
          <Box
            key={ticket.key}
            p={5}
            boxShadow="lg"
            borderRadius="md"
            bg={selectedKey === ticket.key ? "blue.100" : "gray.50"}
            borderLeft={selectedKey === ticket.key ? "6px solid #3182ce" : "6px solid #4299e1"}
            cursor="pointer"
            onClick={() => setSelectedKey(ticket.key)}
            transition="background 0.19s"
          >
            <Flex align="center" justify="space-between">
              <Box>
                <Text fontWeight="bold" fontSize="lg">{ticket.key}: {ticket.summary}</Text>
                <Text fontSize="sm" mt={2}>{ticket.description || <i>No description</i>}</Text>
              </Box>
              <Flex gap={2}>
                <Button size="xs" colorScheme="blue" variant="outline"
                  onClick={e => { e.stopPropagation(); openEditModal(ticket); }}>
                  Edit
                </Button>
                <Button size="xs" colorScheme="red" variant="ghost"
                  onClick={e => { e.stopPropagation(); handleArchive(ticket); }}>
                  Archive
                </Button>
                <Button
                  size="xs"
                  colorScheme="teal"
                  onClick={e => {
                    e.stopPropagation();
                    fetch("http://127.0.0.1:8000/backlog/move_to_sprint", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ key: ticket.key }),
                    })
                      .then(res => res.json())
                      .then(data => {
                        toast({
                          title: data.result || data.error,
                          status: data.error ? "error" : "success",
                          isClosable: true,
                        });
                        reload();
                        if (!data.error) setReloadKey(Date.now());   // <= global reload!
                      });
                  }}
                >
                  Move to Sprint
                </Button>
              </Flex>
            </Flex>
            {aiResults[ticket.key] && (
              <Box mt={3} bg="blue.50" p={3} borderRadius="md">
                <Text color="blue.700" fontWeight="bold">AI Suggestion:</Text>
                <Text><b>Clarification:</b> {aiResults[ticket.key].clarification}</Text>
                <Text><b>Acceptance Criteria:</b> {aiResults[ticket.key].acceptance_criteria}</Text>
                <Text><b>Effort:</b> <Badge colorScheme="yellow">{aiResults[ticket.key].effort}</Badge></Text>
                <Text>
                  <b>Type:</b> {aiResults[ticket.key].type} &nbsp;&nbsp;
                  <b>Priority:</b> <Badge colorScheme="green">{aiResults[ticket.key].priority}</Badge>
                </Text>
                <Button mt={2} size="xs" colorScheme="teal"
                  onClick={() => applySuggestion(ticket.key, aiResults[ticket.key])}
                >
                  Apply Suggestion to Jira
                </Button>
              </Box>
            )}
            {dupes[ticket.key] && (
              <Box mt={3} bg="orange.50" p={2} borderRadius="md">
                <Text color="orange.800" fontWeight="bold">Possible Duplicates:</Text>
                {dupes[ticket.key].length
                  ? dupes[ticket.key].map(d => (
                    <Text fontSize="sm" key={d.key}>• <b>{d.key}</b>: {d.summary} <b>({Math.floor(d.score * 100)}% match)</b></Text>
                  ))
                  : <Text>No close duplicates</Text>}
              </Box>
            )}
            {/* ---- Per-card comment input ---- */}
            <Box mt={2}>
              <Input
                placeholder="Add comment"
                size="sm"
                value={commentDrafts[ticket.key] || ""}
                onChange={e => setCommentDrafts(d => ({ ...d, [ticket.key]: e.target.value }))}
                onKeyDown={e => {
                  if (e.key === "Enter" && (commentDrafts[ticket.key] || ""))
                    handleAddComment(ticket.key);
                }}
                aria-label={`Add comment to ${ticket.key}`}
                width="85%"
                mr={2}
              />
              <Button
                size="xs"
                onClick={() => handleAddComment(ticket.key)}
                disabled={!(commentDrafts[ticket.key] || "")}
              >
                Add
              </Button>
              {!!commentHistory[ticket.key]?.length && (
                <VStack align="start" mt={1}>
                  {commentHistory[ticket.key].map((c, idx) => (
                    <Box key={idx} p={2} bg="gray.50" borderRadius="md" w="100%">
                      <Text fontSize="xs">{c}</Text>
                    </Box>
                  ))}
                </VStack>
              )}
            </Box>
          </Box>
        ))}
        {!backlog.length && <Spinner size="xl" />}
      </VStack>
      {/* Add Card Modal */}
      <Modal isOpen={addModalOpen} onClose={closeAddCard}>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Add New Card</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <FormControl>
              <FormLabel>Summary</FormLabel>
              <Input value={newCard.summary} onChange={e => setNewCard(c => ({ ...c, summary: e.target.value }))} />
            </FormControl>
            <FormControl mt={2}>
              <FormLabel>Description</FormLabel>
              <Textarea value={newCard.description} onChange={e => setNewCard(c => ({ ...c, description: e.target.value }))} />
            </FormControl>
          </ModalBody>
          <ModalFooter>
            <Button colorScheme="blue" mr={3} onClick={submitAddCard}>Add Card</Button>
            <Button onClick={closeAddCard}>Cancel</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
      {/* Edit Modal */}
      <Modal isOpen={!!editTicket} onClose={closeEditModal}>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Edit Backlog Ticket</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <FormControl>
              <FormLabel>Summary</FormLabel>
              <Input value={editTicket?.summary || ''} onChange={e => setEditTicket(s => ({ ...s, summary: e.target.value }))} />
            </FormControl>
            <FormControl mt={2}>
              <FormLabel>Description</FormLabel>
              <Textarea value={editTicket?.description || ''} onChange={e => setEditTicket(s => ({ ...s, description: e.target.value }))} />
            </FormControl>
          </ModalBody>
          <ModalFooter>
            <Button colorScheme="blue" mr={3} onClick={handleEditSave}>Save</Button>
            <Button onClick={closeEditModal}>Cancel</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Box>
  );
}


function Standup() {
  const FORM_KEY = "standup-form-v1";
  const HISTORY_KEY = "standup-history-v1";

  const [form, setForm] = useState(() => {
    const data = localStorage.getItem(FORM_KEY);
    return data ? JSON.parse(data) : { yesterday: "", today: "", blockers: "" };
  });
  const [history, setHistory] = useState(() => {
    const data = localStorage.getItem(HISTORY_KEY);
    return data ? JSON.parse(data) : [];
  });
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState("");
  // The upcomingBacklog state must go here INSIDE the component!
  const [upcomingBacklog, setUpcomingBacklog] = useState("");

  useEffect(() => {
    localStorage.setItem(FORM_KEY, JSON.stringify(form));
  }, [form]);
  useEffect(() => {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  }, [history]);

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });
  const handleClear = () => {
    setForm({ yesterday: "", today: "", blockers: "" });
    localStorage.setItem(FORM_KEY, JSON.stringify({ yesterday: "", today: "", blockers: "" }));
  };

  const autofillStandup = async () => {
    setLoading(true);
    try {
      const resp = await fetch("http://127.0.0.1:8000/standup/suggest");
      const data = await resp.json();
      setForm({
        yesterday: data.yesterday,
        today: data.today,
        blockers: data.blockers,
      });
      setUpcomingBacklog(data.upcoming_backlog); // <-- this is the new field
    } catch (e) {
      alert("Failed to fetch auto-fill suggestions!");
    }
    setLoading(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setSummary("");
    const resp = await fetch("http://127.0.0.1:8000/generate-summary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await resp.json();
    setSummary(data.summary);
    setHistory([form, ...history]);
    setLoading(false);
  };

  const formBg = useColorModeValue("white", "gray.800");
  const summaryBg = useColorModeValue("green.50", "green.900");
  const summaryColor = useColorModeValue("teal.800", "green.100");
  const historyBg = useColorModeValue("gray.50", "gray.800");

  return (
    <MotionSection>
      <Heading mb={4} color="blue.700">Daily Standup</Heading>
      <Button colorScheme="blue" mb={4} onClick={autofillStandup} isLoading={loading}>
        Auto-fill from Jira
      </Button>
      <Box
        as="form"
        onSubmit={handleSubmit}
        bg={formBg}
        p={5}
        borderRadius="lg"
        boxShadow="md"
        mb={8}
        maxW="500px"
      >
        <Text fontWeight="semibold" mb={2}>What did you do yesterday?</Text>
        <textarea
          name="yesterday"
          value={form.yesterday}
          onChange={handleChange}
          rows={2}
          style={{ width: "100%", marginBottom: 10, borderRadius: 8, border: "1px solid #e2e8f0", padding: 8 }}
          required
        />
        <Text fontWeight="semibold" mb={2}>What will you do today?</Text>
        <textarea
          name="today"
          value={form.today}
          onChange={handleChange}
          rows={2}
          style={{ width: "100%", marginBottom: 10, borderRadius: 8, border: "1px solid #e2e8f0", padding: 8 }}
          required
        />
        <Text fontWeight="semibold" mb={2}>Any blockers?</Text>
        <textarea
          name="blockers"
          value={form.blockers}
          onChange={handleChange}
          rows={1}
          style={{ width: "100%", marginBottom: 15, borderRadius: 8, border: "1px solid #e2e8f0", padding: 8 }}
        />
        <Flex gap={2}>
          <Button
            colorScheme="blue"
            type="submit"
            isLoading={loading}
            width="100%"
            mt={2}
          >
            Generate Summary
          </Button>
          <Button
            colorScheme="red"
            type="button"
            variant="outline"
            width="40%"
            mt={2}
            onClick={handleClear}
          >
            Clear
          </Button>
        </Flex>
      </Box>

      {upcomingBacklog && (
        <Box mt={4} p={3} bg="yellow.50" borderRadius="md" boxShadow="md">
          <Text mb={1} color="yellow.700" fontWeight="bold">
            Upcoming / Backlog (Not scheduled):
          </Text>
          <Text>{upcomingBacklog}</Text>
        </Box>
      )}

      {summary && (
        <Box
          bg={summaryBg}
          color={summaryColor}
          p={4}
          borderRadius="md"
          boxShadow="md"
          mb={8}
          fontWeight="bold"
        >
          <Text mb={1}>AI Scrum Master Summary:</Text>
          <Text>{summary}</Text>
        </Box>
      )}
      <Heading size="md" mb={2} color="blue.700">History</Heading>
      <VStack align="stretch" spacing={3}>
        {history.map((item, i) => (
          <Box key={i} p={3} bg={historyBg} borderRadius="md" boxShadow="sm">
            <Text fontSize="sm" color="gray.600" mb={1}>
              <b>Yesterday:</b> {item.yesterday} <br />
              <b>Today:</b> {item.today} <br />
              <b>Blockers:</b> {item.blockers}
            </Text>
          </Box>
        ))}
      </VStack>
    </MotionSection>
  );
}

// ---- Reports (analytics, CSV export) ----
function Reports() {
  const reportBg = useColorModeValue("white", "gray.800");
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const toast = useToast();

  useEffect(() => {
    setLoading(true);
    fetch("http://127.0.0.1:8000/stats")
      .then((r) => r.json())
      .then(setStats)
      .catch(() => toast({ title: "Failed to load stats", status: "error" }))
      .finally(() => setLoading(false));
  }, [toast]);

  return (
    <MotionSection>
      <Heading mb={4} color="blue.700">Reports & Analytics</Heading>
      <Box bg={reportBg} p={4} borderRadius="md" boxShadow="md" mb={4}>
        <Button colorScheme="green" mr={2} onClick={() => window.open("http://127.0.0.1:8000/jira/issues_csv")}>
          Export Board as CSV
        </Button>
        <Button colorScheme="green" mr={2} onClick={() => window.open("http://127.0.0.1:8000/backlog_csv")}>
          Export Backlog as CSV
        </Button>
        <Button colorScheme="teal" onClick={() => window.open("http://127.0.0.1:8000/history_csv")}>
          Export Standups as CSV
        </Button>
      </Box>
      {loading ? (
        <Flex h="180px" align="center" justify="center"><Spinner /></Flex>
      ) : (
        stats && (
          <Box>
            <Text color="blue.600" fontWeight="bold" mb={2}>Sprint Stats:</Text>
            <Text mb={1}>Total Issues: {stats.total_issues}</Text>
            <Text mb={1}>Done: {stats.done}</Text>
            <Text mb={1}>Average Days Per Ticket: {stats.avg_age}</Text>
            <Text mb={1}>Most Common Blocker: {stats.common_blocker}</Text>
            <Text color="green.600" mt={2}>{stats.ai_summary}</Text>
          </Box>
        )
      )}
    </MotionSection>
  );
}

function Settings() {
  const settingsBg = useColorModeValue("white", "gray.800");
  const [aiEnabled, setAiEnabled] = useState(true);

  return (
    <MotionSection>
      <Heading mb={4} color="blue.700">Settings</Heading>
      <Box bg={settingsBg} p={4} borderRadius="md" boxShadow="md">
        <FormControl display="flex" alignItems="center" mb={4}>
          <FormLabel htmlFor="ai-summary" mb="0">
            AI Scrum Summaries
          </FormLabel>
          <Switch id="ai-summary" isChecked={aiEnabled} onChange={() => setAiEnabled(!aiEnabled)} colorScheme="blue" />
        </FormControl>
        <FormControl display="flex" alignItems="center">
          <FormLabel htmlFor="email-notif" mb="0">
            Email Notifications
          </FormLabel>
          <Switch id="email-notif" isChecked={false} colorScheme="green" />
        </FormControl>
        <Text mt={4} color="gray.600" fontSize="sm">
          Integrations, advanced preferences, and theme customization will be available soon.
        </Text>
      </Box>
    </MotionSection>
  );
}

// ---- Master App ----
function App() {
  const [page, setPage] = useState(0);
  const [reloadKey, setReloadKey] = useState(Date.now());
  const { colorMode, toggleColorMode } = useColorMode();
  const bgGradient = useColorModeValue(
    "linear(to-br, blue.50, white 85%)",
    "linear(to-br, gray.900, blue.900 85%)"
  );
  const tabs = [
    (props) => <Dashboard {...props} />,
    (props) => <JiraBoard {...props} reloadKey={reloadKey} />,
    (props) => <BacklogGrooming {...props} setReloadKey={setReloadKey} />,
    (props) => <Standup {...props} reloadKey={reloadKey} />,
    (props) => <Reports {...props} />,
    (props) => <Settings {...props} />,
  ];
  const CurrentComponent = tabs[page];

  return (
    <ChakraProvider>
      <Flex height="100vh" bgGradient={bgGradient}>
        <Sidebar
          page={page}
          setPage={setPage}
          toggleColorMode={toggleColorMode}
          colorMode={colorMode}
        />
        <Box flex="1" p={[3, 8]} overflowY="auto">
          <CurrentComponent />
        </Box>
      </Flex>
    </ChakraProvider>
  );
}

export default App;
