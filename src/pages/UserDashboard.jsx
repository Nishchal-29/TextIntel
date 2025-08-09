// src/pages/UserDashboard.jsx
import React, { useEffect, useState, useMemo } from "react";
import DashboardLayout from "../components/DashboardLayout";
import { useAuth } from "../auth/AuthContext";
import { Card, Row, Col, Badge, Button, Form, Table } from "react-bootstrap";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";

const STATUS_COLORS = {
  benign: "#28a745",
  suspicious: "#ffc107",
  critical: "#dc3545",
};

export default function UserDashboard() {
  const { authAxios } = useAuth();
  const [reportText, setReportText] = useState("");
  const [submissions, setSubmissions] = useState([]);
  const [summary, setSummary] = useState({ benign: 0, suspicious: 0, critical: 0 });
  const [loading, setLoading] = useState(false);

  // Fetch previous submissions from DB
  useEffect(() => {
    (async () => {
      try {
        const res = await authAxios.get("/api/messages/user");
        if (res.data.messages) {
          setSubmissions(res.data.messages);
          const counts = { benign: 0, suspicious: 0, critical: 0 };
          res.data.messages.forEach((m) => {
            counts[m.classification] = (counts[m.classification] || 0) + 1;
          });
          setSummary(counts);
        }
      } catch (err) {
        console.error("Failed to fetch user messages", err);
      }
    })();
  }, [authAxios]);

  const handleSubmit = async () => {
    if (!reportText.trim()) return;
    setLoading(true);
    try {
      // Step 1: Classify via FastAPI
      const resp = await authAxios.post(
        `${import.meta.env.VITE_FASTAPI_BASE || ""}/classify`,
        { text: reportText },
        { headers: { "Content-Type": "application/json" } }
      );
      const { predicted_class } = resp.data;

      // Step 2: Save to backend DB
      const saveRes = await authAxios.post("/api/messages", {
        text: reportText,
        classification: predicted_class
      });

      // Step 3: Update UI instantly
      const savedMsg = saveRes.data.message || {
        id: Date.now(),
        text: reportText,
        classification: predicted_class,
        created_at: new Date().toISOString(),
      };

      setSubmissions((prev) => [savedMsg, ...prev]);
      setSummary((prev) => ({
        ...prev,
        [predicted_class]: (prev[predicted_class] || 0) + 1,
      }));
      setReportText("");
    } catch (e) {
      console.error("Submit error:", e);
    } finally {
      setLoading(false);
    }
  };

  // Pie chart data
  const pieData = [
    { name: "Benign", value: summary.benign },
    { name: "Suspicious", value: summary.suspicious },
    { name: "Critical", value: summary.critical },
  ];

  // Top keywords from submissions
  const topKeywords = useMemo(() => {
    const wordCount = {};
    submissions.forEach((s) => {
      s.text
        ?.toLowerCase()
        .split(/\W+/)
        .filter((w) => w.length > 3)
        .forEach((w) => {
          wordCount[w] = (wordCount[w] || 0) + 1;
        });
    });
    return Object.entries(wordCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);
  }, [submissions]);

  return (
    <DashboardLayout title="Your Dashboard">
      {/* Top Stats */}
      <Row className="mb-4">
        {["benign", "suspicious", "critical"].map((type) => (
          <Col md={4} key={type}>
            <Card className="text-center shadow-sm">
              <Card.Body>
                <Card.Title className="mb-1 text-capitalize">{type}</Card.Title>
                <h3 className="mb-0">{summary[type] || 0}</h3>
              </Card.Body>
            </Card>
          </Col>
        ))}
      </Row>

      {/* Input and Pie Chart */}
      <Row className="mb-4">
        <Col md={4}>
          <Card className="mb-3 shadow-sm">
            <Card.Body>
              <Card.Title>Submit New Report</Card.Title>
              <Form>
                <Form.Group className="mb-2">
                  <Form.Control
                    as="textarea"
                    placeholder="Type text to classify..."
                    rows={3}
                    value={reportText}
                    onChange={(e) => setReportText(e.target.value)}
                  />
                </Form.Group>
                <Button onClick={handleSubmit} disabled={loading || !reportText.trim()}>
                  {loading ? "Analyzing..." : "Submit & Classify"}
                </Button>
              </Form>
            </Card.Body>
          </Card>

          <Card className="shadow-sm">
            <Card.Header>Top Keywords</Card.Header>
            <Card.Body>
              {topKeywords.length ? (
                <ul className="list-inline mb-0">
                  {topKeywords.map(([word, count]) => (
                    <li key={word} className="list-inline-item m-1">
                      <Badge bg="secondary">{word} ({count})</Badge>
                    </li>
                  ))}
                </ul>
              ) : (
                <small className="text-muted">No keywords yet</small>
              )}
            </Card.Body>
          </Card>
        </Col>

        <Col md={8}>
          <Card className="mb-3 shadow-sm">
            <Card.Header>Classification Distribution</Card.Header>
            <Card.Body style={{ height: 300 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={60} outerRadius={100} label>
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
      </Row>

      {/* Submissions Table */}
      <Card className="mb-4 shadow-sm">
        <Card.Header>Your Recent Submissions</Card.Header>
        <Card.Body>
          <Table hover responsive>
            <thead>
              <tr>
                <th>Date</th>
                <th>Text</th>
                <th>Classification</th>
              </tr>
            </thead>
            <tbody>
              {submissions.length ? (
                submissions.map((r) => (
                  <tr key={r.id}>
                    <td>{r.created_at?.slice(0, 10)}</td>
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
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={3} className="text-center">
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
