// src/pages/UserDashboard.jsx
import React, { useEffect, useState } from "react";
import DashboardLayout from "../components/DashboardLayout";
import { useAuth } from "../auth/AuthContext";
import { Card, Row, Col, Badge, Button, Form, Table } from "react-bootstrap";
import { PieChart, Pie, Cell, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

const STATUS_COLORS = {
  benign: "#28a745",
  suspicious: "#ffc107",
  critical: "#dc3545",
};

const sampleHistory = [
  { time: "2025-07-25", label: "benign" },
  { time: "2025-07-26", label: "suspicious" },
  { time: "2025-07-27", label: "critical" },
  { time: "2025-07-28", label: "benign" },
  { time: "2025-07-29", label: "suspicious" },
];

export default function UserDashboard() {
  const { authAxios } = useAuth();
  const [reportText, setReportText] = useState("");
  const [submissions, setSubmissions] = useState([]);
  const [summary, setSummary] = useState({ benign: 0, suspicious: 0, critical: 0 });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // TODO: fetch user's previous reports from backend, stubbed here
    // Example: authAxios.get("/api/reports?mine=true")
    const fetch = async () => {
      // placeholder: simulate
      setSubmissions([
        {
          id: "r1",
          text: "Suspicious chatter about movement near Delhi",
          classification: "suspicious",
          confidence: 0.68,
          created_at: "2025-08-01",
        },
        {
          id: "r2",
          text: "Routine status update from base camp",
          classification: "benign",
          confidence: 0.95,
          created_at: "2025-07-30",
        },
      ]);
      setSummary({ benign: 5, suspicious: 2, critical: 1 });
    };
    fetch();
  }, [authAxios]);

  const handleSubmit = async () => {
    if (!reportText) return;
    setLoading(true);
    try {
      const resp = await authAxios.post("/infer", { text: reportText }); // backend inference
      // Append to submissions
      setSubmissions((prev) => [
        {
          id: Date.now(),
          text: reportText,
          classification: resp.data.classification.label,
          confidence: resp.data.classification.score,
          created_at: new Date().toISOString().split("T")[0],
        },
        ...prev,
      ]);
      // Update summary (naively)
      setSummary((prev) => ({
        ...prev,
        [resp.data.classification.label]:
          (prev[resp.data.classification.label] || 0) + 1,
      }));
      setReportText("");
    } catch (e) {
      console.error("Submit error", e);
    } finally {
      setLoading(false);
    }
  };

  const pieData = [
    { name: "Benign", value: summary.benign },
    { name: "Suspicious", value: summary.suspicious },
    { name: "Critical", value: summary.critical },
  ];

  const lineData = sampleHistory.map((d, i) => ({
    name: d.time,
    benign: d.label === "benign" ? 1 : 0,
    suspicious: d.label === "suspicious" ? 1 : 0,
    critical: d.label === "critical" ? 1 : 0,
  }));

  return (
    <DashboardLayout title="Your Dashboard">
      <Row className="mb-4">
        <Col md={4}>
          <Card className="mb-3">
            <Card.Body>
              <Card.Title>Submit New Report</Card.Title>
              <Form>
                <Form.Group className="mb-2">
                  <Form.Control
                    as="textarea"
                    placeholder="Type intercepted communication or report..."
                    rows={3}
                    value={reportText}
                    onChange={(e) => setReportText(e.target.value)}
                  />
                </Form.Group>
                <Button onClick={handleSubmit} disabled={loading}>
                  {loading ? "Analyzing..." : "Submit & Classify"}
                </Button>
              </Form>
              <div className="mt-2">
                <small className="text-muted">
                  Supports English/Hinglish input; model will classify and
                  highlight entities.
                </small>
              </div>
            </Card.Body>
          </Card>
        </Col>
        <Col md={8}>
          <Row>
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
                          <Cell
                            key={idx}
                            fill={
                              entry.name === "Benign"
                                ? STATUS_COLORS.benign
                                : entry.name === "Suspicious"
                                ? STATUS_COLORS.suspicious
                                : STATUS_COLORS.critical
                            }
                          />
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
                <Card.Header>Recent Classification Trend</Card.Header>
                <Card.Body style={{ height: 220 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={lineData}>
                      <XAxis dataKey="name" />
                      <YAxis />
                      <Tooltip />
                      <Line
                        type="monotone"
                        dataKey="benign"
                        stroke={STATUS_COLORS.benign}
                        strokeWidth={2}
                      />
                      <Line
                        type="monotone"
                        dataKey="suspicious"
                        stroke={STATUS_COLORS.suspicious}
                        strokeWidth={2}
                      />
                      <Line
                        type="monotone"
                        dataKey="critical"
                        stroke={STATUS_COLORS.critical}
                        strokeWidth={2}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </Card.Body>
              </Card>
            </Col>
          </Row>
        </Col>
      </Row>

      <Card className="mb-4">
        <Card.Header>Your Recent Submissions</Card.Header>
        <Card.Body>
          <Table hover responsive>
            <thead>
              <tr>
                <th>Date</th>
                <th>Text</th>
                <th>Classification</th>
                <th>Confidence</th>
              </tr>
            </thead>
            <tbody>
              {submissions.map((r) => (
                <tr key={r.id}>
                  <td>{r.created_at}</td>
                  <td>{r.text}</td>
                  <td>
                    <Badge
                      bg={
                        r.classification === "critical"
                          ? "danger"
                          : r.classification === "suspicious"
                          ? "warning"
                          : "success"
                      }
                    >
                      {r.classification}
                    </Badge>
                  </td>
                  <td>{(r.confidence * 100).toFixed(1)}%</td>
                </tr>
              ))}
              {submissions.length === 0 && (
                <tr>
                  <td colSpan={4} className="text-center">
                    No submissions yet.
                  </td>
                </tr>
              )}
            </tbody>
          </Table>
        </Card.Body>
      </Card>
    </DashboardLayout>
  );
}
