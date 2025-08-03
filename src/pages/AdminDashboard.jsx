// src/pages/AdminDashboard.jsx
import React, { useEffect, useState } from "react";
import DashboardLayout from "../components/DashboardLayout";
import { useAuth } from "../auth/AuthContext";
import { Card, Row, Col, Table, Badge, Button, Form, Spinner } from "react-bootstrap";

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

  useEffect(() => {
    fetchUsers();
    fetchAudit();
    // Optionally fetch real model metrics
  }, [authAxios]);

  const fetchUsers = async () => {
    setLoadingUsers(true);
    try {
      // Placeholder: replace with real endpoint `/api/admin/users`
      const res = await authAxios.get("/api/admin/users");
      setUsers(res.data.users || []);
    } catch (e) {
      console.warn("fetchUsers stub fallback");
      setUsers([
        { id: "u1", username: "analyst@example.com", role: "user" },
        { id: "u2", username: "commander@example.com", role: "commander" },
        { id: "u3", username: "admin@example.com", role: "admin" },
      ]);
    } finally {
      setLoadingUsers(false);
    }
  };

  const fetchAudit = async () => {
    setLoadingAudit(true);
    try {
      // Placeholder: replace with `/api/audit-logs?limit=20`
      const res = await authAxios.get("/api/audit-logs?limit=20");
      setAuditLogs(res.data.logs || []);
    } catch (e) {
      console.warn("fetchAudit stub fallback");
      setAuditLogs([
        { id: 1, username: "analyst@example.com", action: "login_success", success: true, created_at: "2025-08-03 10:00" },
        { id: 2, username: "analyst@example.com", action: "infer", success: true, created_at: "2025-08-03 10:05" },
      ]);
    } finally {
      setLoadingAudit(false);
    }
  };

  const triggerRetrain = async () => {
    setRetraining(true);
    try {
      // Hit backend retrain endpoint e.g., POST /api/model/retrain
      await authAxios.post("/api/model/retrain");
      // Refresh metrics after
      setModelMetrics((m) => ({ ...m, last_trained: new Date().toISOString().slice(0, 16).replace("T", " ") }));
    } catch (e) {
      console.error("Retrain failed", e);
    } finally {
      setRetraining(false);
    }
  };

  const changeRole = async (userId, newRole) => {
    // Call backend to patch role: PATCH /api/admin/users/:id/role
    // Stubbed: update locally
    setUsers((u) =>
      u.map((x) => (x.id === userId ? { ...x, role: newRole } : x))
    );
  };

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
                    <Badge bg="warning">{(modelMetrics.false_positive_rate * 100).toFixed(1)}%</Badge>
                  </div>
                  <div>
                    False Negative Rate:{" "}
                    <Badge bg="danger">{(modelMetrics.false_negative_rate * 100).toFixed(1)}%</Badge>
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
                      Use analyst feedback to improve the model periodically. :contentReference[oaicite:8]{index=8}
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
