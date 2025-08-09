// src/pages/AdminDashboard.jsx
import React, { useEffect, useState } from "react";
import DashboardLayout from "../components/DashboardLayout";
import { useAuth } from "../auth/AuthContext";
import { Card, Row, Col, Table, Badge, Button, Form, Spinner } from "react-bootstrap";
import {
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

const STATUS_COLORS = {
  benign: "#28a745",
  suspicious: "#ffc107",
  critical: "#dc3545",
};

export default function AdminDashboard() {
  const { authAxios } = useAuth();
  const [users, setUsers] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [modelMetrics, setModelMetrics] = useState({
    false_positive_rate: 0.12,
    false_negative_rate: 0.07,
    last_trained: "2025-07-30 12:00",
  });
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [loadingAudit, setLoadingAudit] = useState(false);
  const [retraining, setRetraining] = useState(false);

  // Classified messages state
  const [messages, setMessages] = useState([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [editId, setEditId] = useState(null);
  const [editText, setEditText] = useState("");
  const [editClassification, setEditClassification] = useState("");

  useEffect(() => {
    fetchUsers();
    fetchAudit();
    fetchMessages();
  }, [authAxios]);

  const fetchUsers = async () => {
    setLoadingUsers(true);
    try {
      const res = await authAxios.get("/api/admin/users");
      setUsers(res.data.users || []);
    } catch (e) {
      console.error("Failed to fetch users", e);
      setUsers([]);
    } finally {
      setLoadingUsers(false);
    }
  };

  const fetchAudit = async () => {
    setLoadingAudit(true);
    try {
      const res = await authAxios.get("/api/audit-logs?limit=20");
      setAuditLogs(res.data.logs || []);
    } catch (e) {
      console.error("Failed to fetch audit logs", e);
      setAuditLogs([]);
    } finally {
      setLoadingAudit(false);
    }
  };

  const fetchMessages = async () => {
    setLoadingMessages(true);
    try {
      const res = await authAxios.get("/api/admin/messages");
      setMessages(res.data.messages || []);
    } catch (e) {
      setMessages([]);
    } finally {
      setLoadingMessages(false);
    }
  };

  const triggerRetrain = async () => {
    setRetraining(true);
    try {
      await authAxios.post("http://localhost:8000/api/model/retrain");
      setModelMetrics((m) => ({
        ...m,
        last_trained: new Date().toISOString().slice(0, 16).replace("T", " "),
      }));
    } catch (e) {
      console.error("Retrain failed", e);
      if (e.response) {
        // The request was made and the server responded with a status code
        // that falls out of the range of 2xx
        console.error("Response data:", e.response.data);
        console.error("Response status:", e.response.status);
        console.error("Response headers:", e.response.headers);
      } else if (e.request) {
        // The request was made but no response was received
        console.error("No response received:", e.request);
      } else {
        // Something happened in setting up the request that triggered an Error
        console.error("Error message:", e.message);
      }
    } finally {
      setRetraining(false);
    }
  };

  const changeRole = async (userId, newRole) => {
    try {
      await authAxios.patch(`/api/admin/users/${userId}/role`, { role: newRole });
      setUsers((u) =>
        u.map((x) => (x.id === userId ? { ...x, role: newRole } : x))
      );
    } catch (err) {
      console.error("Failed to update role", err);
    }
  };

  // Edit message handlers
  const startEdit = (msg) => {
    setEditId(msg.id);
    setEditText(msg.text);
    setEditClassification(msg.classification);
  };

  const cancelEdit = () => {
    setEditId(null);
    setEditText("");
    setEditClassification("");
  };

  const saveEdit = async (id) => {
    try {
      await authAxios.patch(`/api/admin/messages/${id}`, {
        text: editText,
        classification: editClassification,
      });
      fetchMessages();
      cancelEdit();
    } catch (e) {
      alert("Failed to update message");
    }
  };

  const deleteMessage = async (id) => {
    if (!window.confirm("Delete this message?")) return;
    try {
      await authAxios.delete(`/api/admin/messages/${id}`);
      setMessages((msgs) => msgs.filter((m) => m.id !== id));
    } catch (e) {
      alert("Failed to delete message");
    }
  };

  // Chart data
  const summary = messages.reduce(
    (acc, m) => {
      acc[m.classification] = (acc[m.classification] || 0) + 1;
      return acc;
    },
    { benign: 0, suspicious: 0, critical: 0 }
  );
  const pieData = [
    { name: "Benign", value: summary.benign },
    { name: "Suspicious", value: summary.suspicious },
    { name: "Critical", value: summary.critical },
  ];

  const trendMap = {};
  messages.forEach((m) => {
    const date = m.created_at?.slice(0, 10) || "unknown";
    if (!trendMap[date])
      trendMap[date] = { name: date, benign: 0, suspicious: 0, critical: 0 };
    trendMap[date][m.classification] += 1;
  });
  const lineData = Object.values(trendMap).sort((a, b) =>
    a.name.localeCompare(b.name)
  );

  return (
    <DashboardLayout title="Admin Control Center">
      <Row className="mb-4">
        <Col md={6}>
          <Card className="mb-3">
            <Card.Header>Model Performance</Card.Header>
            <Card.Body>
              <Row>
                <Col>
                  <div>
                    False Positive Rate:{" "}
                    <Badge bg="warning">
                      {(modelMetrics.false_positive_rate * 100).toFixed(1)}%
                    </Badge>
                  </div>
                  <div>
                    False Negative Rate:{" "}
                    <Badge bg="danger">
                      {(modelMetrics.false_negative_rate * 100).toFixed(1)}%
                    </Badge>
                  </div>
                  <div>
                    Last Trained: <strong>{modelMetrics.last_trained}</strong>
                  </div>
                  <div className="mt-2">
                    <Button onClick={triggerRetrain} disabled={retraining}>
                      {retraining ? (
                        <>
                          <Spinner animation="border" size="sm" /> Retraining...
                        </>
                      ) : (
                        "Trigger Retrain"
                      )}
                    </Button>
                  </div>
                  <div className="mt-1">
                    <small className="text-muted">
                      Use analyst feedback to improve the model periodically.
                    </small>
                  </div>
                </Col>
              </Row>
            </Card.Body>
          </Card>
        </Col>

        <Col md={6}>
          <Card className="mb-3">
            <Card.Header>User Management</Card.Header>
            <Card.Body>
              {loadingUsers ? (
                <div className="text-center">Loading users...</div>
              ) : (
                <Table hover size="sm">
                  <thead>
                    <tr>
                      <th>Username</th>
                      <th>Role</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => (
                      <tr key={u.id}>
                        <td>{u.username}</td>
                        <td>{u.role}</td>
                        <td>
                          <Form.Select
                            size="sm"
                            value={u.role}
                            onChange={(e) => changeRole(u.id, e.target.value)}
                          >
                            <option value="user">user</option>
                            <option value="commander">commander</option>
                            <option value="admin">admin</option>
                          </Form.Select>
                        </td>
                      </tr>
                    ))}
                    {users.length === 0 && (
                      <tr>
                        <td colSpan={3}>No users found</td>
                      </tr>
                    )}
                  </tbody>
                </Table>
              )}
            </Card.Body>
          </Card>
        </Col>
      </Row>

      <Card className="mb-4">
        <Card.Header>All Classified Messages</Card.Header>
        <Card.Body>
          {loadingMessages ? (
            <div>Loading messages...</div>
          ) : (
            <Table hover responsive>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>User</th>
                  <th>Text</th>
                  <th>Classification</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {messages.length ? (
                  messages.map((m) =>
                    editId === m.id ? (
                      <tr key={m.id}>
                        <td>{m.created_at?.slice(0, 10)}</td>
                        <td>{m.username || "unknown"}</td>
                        <td>
                          <Form.Control
                            as="textarea"
                            rows={2}
                            value={editText}
                            onChange={(e) => setEditText(e.target.value)}
                          />
                        </td>
                        <td>
                          <Form.Select
                            value={editClassification}
                            onChange={(e) => setEditClassification(e.target.value)}
                          >
                            <option value="benign">benign</option>
                            <option value="suspicious">suspicious</option>
                            <option value="critical">critical</option>
                          </Form.Select>
                        </td>
                        <td>{(m.confidence * 100).toFixed(1)}%</td>
                        <td>
                          <Button size="sm" variant="success" onClick={() => saveEdit(m.id)}>
                            Save
                          </Button>{" "}
                          <Button size="sm" variant="secondary" onClick={cancelEdit}>
                            Cancel
                          </Button>
                        </td>
                      </tr>
                    ) : (
                      <tr key={m.id}>
                        <td>{m.created_at?.slice(0, 10)}</td>
                        <td>{m.username || "unknown"}</td>
                        <td>{m.text}</td>
                        <td>
                          <Badge
                            bg={
                              m.classification === "critical"
                                ? "danger"
                                : m.classification === "suspicious"
                                ? "warning"
                                : "success"
                            }
                          >
                            {m.classification}
                          </Badge>
                        </td>
                        <td>
                          <Button size="sm" variant="primary" onClick={() => startEdit(m)}>
                            Edit
                          </Button>{" "}
                          <Button size="sm" variant="danger" onClick={() => deleteMessage(m.id)}>
                            Delete
                          </Button>
                        </td>
                      </tr>
                    )
                  )
                ) : (
                  <tr>
                    <td colSpan={6} className="text-center">
                      No messages found.
                    </td>
                  </tr>
                )}
              </tbody>
            </Table>
          )}
        </Card.Body>
      </Card>

      <Row className="mb-4">
        <Col md={6}>
          <Card className="mb-3">
            <Card.Header>Classification Distribution</Card.Header>
            <Card.Body style={{ height: 220 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={50}
                    outerRadius={80}
                    label
                  >
                    {pieData.map((entry, idx) => (
                      <Cell key={idx} fill={STATUS_COLORS[entry.name.toLowerCase()]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </Card.Body>
          </Card>
        </Col>
        <Col md={6}>
          <Card className="mb-3">
            <Card.Header>Classification Trend</Card.Header>
            <Card.Body style={{ height: 220 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={lineData}>
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  {Object.entries(STATUS_COLORS).map(([key, color]) => (
                    <Line
                      key={key}
                      type="monotone"
                      dataKey={key}
                      stroke={color}
                      strokeWidth={2}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      <Card className="mb-4">
        <Card.Header>Audit Logs</Card.Header>
        <Card.Body>
          {loadingAudit ? (
            <div>Loading audit logs...</div>
          ) : (
            <Table hover size="sm">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>User</th>
                  <th>Action</th>
                  <th>Success</th>
                </tr>
              </thead>
              <tbody>
                {auditLogs.map((l) => (
                  <tr key={l.id}>
                    <td>{l.created_at}</td>
                    <td>{l.username || "SYSTEM"}</td>
                    <td>{l.action}</td>
                    <td>
                      {l.success ? (
                        <Badge bg="success">✓</Badge>
                      ) : (
                        <Badge bg="danger">✗</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
          <div className="text-end">
            <Button size="sm" onClick={fetchAudit}>
              Refresh
            </Button>
          </div>
        </Card.Body>
      </Card>
    </DashboardLayout>
  );
}
