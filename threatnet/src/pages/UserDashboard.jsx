// src/pages/UserDashboard.jsx
import React, { useEffect, useState, useRef } from "react";
import DashboardLayout from "../components/DashboardLayout";
import { useAuth } from "../auth/AuthContext";
import { 
  Card, Row, Col, Badge, Button, Form, Table, Alert, 
  Spinner, Modal, ProgressBar, InputGroup, Dropdown,
  ButtonGroup, OverlayTrigger, Tooltip 
} from "react-bootstrap";
import { 
  PieChart, Pie, Cell, LineChart, Line, XAxis, YAxis, 
  Tooltip as RechartsTooltip, ResponsiveContainer, BarChart, 
  Bar, AreaChart, Area 
} from "recharts";

const STATUS_COLORS = {
  benign: "#28a745",
  suspicious: "#ffc107", 
  critical: "#dc3545",
};

const THREAT_LEVELS = {
  benign: { level: 1, color: "success", icon: "shield-check" },
  suspicious: { level: 2, color: "warning", icon: "exclamation-triangle" },
  critical: { level: 3, color: "danger", icon: "shield-exclamation" }
};

export default function UserDashboard() {
  const { authAxios } = useAuth();
  
  // State for submissions and analytics
  const [submissions, setSubmissions] = useState([]);
  const [filteredSubmissions, setFilteredSubmissions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedSubmission, setSelectedSubmission] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  
  // State for new submission
  const [reportText, setReportText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [pdfFile, setPdfFile] = useState(null);
  
  // State for analytics
  const [summary, setSummary] = useState({ benign: 0, suspicious: 0, critical: 0 });
  const [weeklyTrend, setWeeklyTrend] = useState([]);
  const [topKeywords, setTopKeywords] = useState([]);
  const [personalStats, setPersonalStats] = useState({
    totalSubmissions: 0,
    accuracy: 0,
    streak: 0,
    avgWordsPerSubmission: 0
  });
  
  // State for filters and search
  const [searchTerm, setSearchTerm] = useState("");
  const [filterClassification, setFilterClassification] = useState("all");
  const [filterDateRange, setFilterDateRange] = useState("30");
  const [sortBy, setSortBy] = useState("date");
  const [sortOrder, setSortOrder] = useState("desc");
  
  // State for real-time updates
  const [lastUpdate, setLastUpdate] = useState(new Date());
  const [autoRefresh, setAutoRefresh] = useState(false);
  const intervalRef = useRef(null);

  // Initial data fetch
  useEffect(() => {
    fetchAllData();
  }, []);

  // State for notifications
  const [notification, setNotification] = useState(null);

  // Auto-refresh setup (optional for user dashboard)
  useEffect(() => {
    if (autoRefresh) {
      intervalRef.current = setInterval(() => {
        fetchAllData();
        setLastUpdate(new Date());
      }, 60000); // Refresh every 60 seconds
    } else {
      clearInterval(intervalRef.current);
    }
    return () => clearInterval(intervalRef.current);
  }, [autoRefresh]);

  // Filter and search effect
  useEffect(() => {
    let filtered = [...submissions];
    
    // Apply search filter
    if (searchTerm) {
      filtered = filtered.filter(sub => 
        sub.text.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    
    // Apply classification filter
    if (filterClassification !== "all") {
      filtered = filtered.filter(sub => sub.classification === filterClassification);
    }
    
    // Apply date range filter
    if (filterDateRange !== "all") {
      const days = parseInt(filterDateRange);
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);
      filtered = filtered.filter(sub => new Date(sub.created_at) >= cutoffDate);
    }
    
    // Apply sorting
    filtered.sort((a, b) => {
      let aVal, bVal;
      switch (sortBy) {
        case "date":
          aVal = new Date(a.created_at);
          bVal = new Date(b.created_at);
          break;
        case "threat":
          aVal = THREAT_LEVELS[a.classification].level;
          bVal = THREAT_LEVELS[b.classification].level;
          break;
        case "length":
          aVal = a.text.length;
          bVal = b.text.length;
          break;
        default:
          return 0;
      }
      
      if (sortOrder === "asc") {
        return aVal > bVal ? 1 : -1;
      } else {
        return aVal < bVal ? 1 : -1;
      }
    });
    
    setFilteredSubmissions(filtered);
  }, [submissions, searchTerm, filterClassification, filterDateRange, sortBy, sortOrder]);

  const fetchAllData = async () => {
    setLoading(true);
    try {
      await Promise.all([
        fetchSubmissions(),
        fetchKeywords()
      ]);
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchSubmissions = async () => {
    try {
      const res = await authAxios.get("/api/messages/user");
      const subs = res.data.messages || [];
      setSubmissions(subs);
      
      // Calculate summary stats
      const counts = { benign: 0, suspicious: 0, critical: 0 };
      subs.forEach(sub => {
        counts[sub.classification] = (counts[sub.classification] || 0) + 1;
      });
      setSummary(counts);
      
      // Calculate weekly trends
      const trendMap = {};
      subs.forEach(sub => {
        const date = sub.created_at?.slice(0, 10) || "unknown";
        if (!trendMap[date]) {
          trendMap[date] = { date, benign: 0, suspicious: 0, critical: 0, total: 0 };
        }
        trendMap[date][sub.classification]++;
        trendMap[date].total++;
      });
      
      const trends = Object.values(trendMap)
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(-7); // Last 7 days
      setWeeklyTrend(trends);
      
      // Calculate personal stats
      const totalWords = subs.reduce((acc, sub) => acc + sub.text.split(' ').length, 0);
      const avgWords = subs.length ? Math.round(totalWords / subs.length) : 0;
      
      // Calculate streak (consecutive days with submissions)
      const today = new Date();
      let streak = 0;
      for (let i = 0; i < 30; i++) {
        const checkDate = new Date(today);
        checkDate.setDate(today.getDate() - i);
        const dateStr = checkDate.toISOString().slice(0, 10);
        const hasSubmission = subs.some(sub => sub.created_at?.slice(0, 10) === dateStr);
        if (hasSubmission) {
          streak++;
        } else if (i > 0) { // Allow today to be empty
          break;
        }
      }
      
      setPersonalStats({
        totalSubmissions: subs.length,
        accuracy: Math.round(((counts.benign + counts.suspicious * 0.5) / subs.length) * 100) || 0,
        streak: streak,
        avgWordsPerSubmission: avgWords
      });
      
    } catch (error) {
      console.error("Error fetching submissions:", error);
    }
  };

  const fetchKeywords = async () => {
    try {
      if (!submissions.length) {
        setTopKeywords([]);
        return;
      }

      const entityCounts = {};
      
      // Process submissions for keyword extraction
      for (const sub of submissions.slice(0, 20)) { // Limit to avoid too many API calls
        try {
          const res = await authAxios.post(
            `${import.meta.env.VITE_FASTAPI_BASE || ""}/ner`,
            { sentence: sub.text },
            { headers: { "Content-Type": "application/json" } }
          );
          
          if (res.data.entities) {
            res.data.entities.forEach(entity => {
              const key = entity.text.toLowerCase();
              if (!entityCounts[key]) {
                entityCounts[key] = {
                  text: entity.text,
                  label: entity.label,
                  count: 0
                };
              }
              entityCounts[key].count++;
            });
          }
        } catch (error) {
          console.error(`Error processing NER for submission ${sub.id}:`, error);
        }
      }
      
      const sortedKeywords = Object.values(entityCounts)
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);
      
      setTopKeywords(sortedKeywords);
    } catch (error) {
      console.error("Error in keyword analysis:", error);
    }
  };

  const handleSubmit = async () => {
    if (!reportText.trim()) return;
    setSubmitting(true);
    try {
      // Step 1: Classify via FastAPI
      const resp = await authAxios.post(
        `${import.meta.env.VITE_FASTAPI_BASE || "http://localhost:8000"}/classify`,
        { text: reportText },
        { headers: { "Content-Type": "application/json" } }
      );
      const { predicted_class, confidence } = resp.data;

      // Step 2: Save to backend DB
      const saveRes = await authAxios.post("/api/messages", {
        text: reportText,
        classification: predicted_class
      });

      // Step 3: Update UI immediately with the new submission
      const newSubmission = saveRes.data.message || {
        id: Date.now(),
        text: reportText,
        classification: predicted_class,
        confidence: confidence,
        created_at: new Date().toISOString()
      };

      // Add to submissions array at the beginning
      setSubmissions(prev => [newSubmission, ...prev]);
      
      // Update summary immediately
      setSummary(prev => ({
        ...prev,
        [predicted_class]: (prev[predicted_class] || 0) + 1
      }));

      setReportText("");
      
      // Show success notification
      setNotification({
        type: 'success',
        message: `Report successfully classified as ${predicted_class.toUpperCase()}`,
        confidence: confidence ? `(${(confidence * 100).toFixed(1)}% confidence)` : ''
      });
      
      // Clear notification after 5 seconds
      setTimeout(() => setNotification(null), 5000);
      
    } catch (error) {
      console.error("Submit error:", error);
      // Show error feedback to user
      alert(`Classification failed: ${error.response?.data?.detail || error.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handlePdfUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      // Step 1: Process PDF via FastAPI
      const resp = await authAxios.post(
        `${import.meta.env.VITE_FASTAPI_BASE || "http://localhost:8000"}/upload-pdf`,
        formData,
        { headers: { "Content-Type": "multipart/form-data" } }
      );
      const { input_text, predicted_class, confidence } = resp.data;

      // Step 2: Save to backend DB
      const saveRes = await authAxios.post("/api/messages", {
        text: input_text,
        classification: predicted_class
      });

      // Step 3: Update UI immediately
      const newSubmission = saveRes.data.message || {
        id: Date.now(),
        text: input_text,
        classification: predicted_class,
        confidence: confidence,
        created_at: new Date().toISOString()
      };

      setSubmissions(prev => [newSubmission, ...prev]);
      setSummary(prev => ({
        ...prev,
        [predicted_class]: (prev[predicted_class] || 0) + 1
      }));

      // Reset file input
      e.target.value = '';
      
      // Show success notification
      setNotification({
        type: 'success',
        message: `PDF successfully classified as ${predicted_class.toUpperCase()}`,
        confidence: confidence ? `(${(confidence * 100).toFixed(1)}% confidence)` : ''
      });
      
      // Clear notification after 5 seconds
      setTimeout(() => setNotification(null), 5000);
      
    } catch (error) {
      console.error("PDF upload error:", error);
      alert(`PDF processing failed: ${error.response?.data?.detail || error.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmissionClick = async (submission) => {
    setSelectedSubmission(submission);
    
    // Fetch additional details via NER
    try {
      const res = await authAxios.post(
        `${import.meta.env.VITE_FASTAPI_BASE || ""}/ner`,
        { sentence: submission.text },
        { headers: { "Content-Type": "application/json" } }
      );
      setSelectedSubmission(prev => ({ ...prev, entities: res.data.entities || [] }));
    } catch (error) {
      console.error("Error fetching entities:", error);
    }
    
    setShowDetailModal(true);
  };

  // Chart data
  const pieData = [
    { name: "Benign", value: summary.benign, color: STATUS_COLORS.benign },
    { name: "Suspicious", value: summary.suspicious, color: STATUS_COLORS.suspicious },
    { name: "Critical", value: summary.critical, color: STATUS_COLORS.critical },
  ];

  const getEntityBadgeColor = (label) => {
    const colors = {
      "PERSON": "primary",
      "GPE": "info", 
      "TIME": "secondary",
      "WEAPON": "danger",
      "ORG": "warning"
    };
    return colors[label] || "dark";
  };

  const getPerformanceBadge = (accuracy) => {
    if (accuracy >= 80) return "success";
    if (accuracy >= 60) return "warning";
    return "danger";
  };

  return (
    <DashboardLayout title="Personal Intelligence Dashboard">
      {/* Success/Error Notification */}
      {notification && (
        <Alert 
          variant={notification.type} 
          dismissible 
          onClose={() => setNotification(null)}
          className="mb-3"
        >
          <div className="d-flex align-items-center">
            <i className={`bi bi-${notification.type === 'success' ? 'check-circle-fill' : 'exclamation-triangle-fill'} me-2`}></i>
            <div>
              <strong>{notification.message}</strong>
              {notification.confidence && (
                <div className="small">{notification.confidence}</div>
              )}
            </div>
          </div>
        </Alert>
      )}

      {/* Header with Controls */}
      <Row className="mb-4">
        <Col md={8}>
          <Card className="border-0 shadow-sm">
            <Card.Body>
              <div className="d-flex justify-content-between align-items-center">
                <div>
                  <h5 className="mb-1">
                    <i className="bi bi-person-badge text-primary me-2"></i>
                    Personal Analytics Overview
                  </h5>
                  <small className="text-muted">
                    Last updated: {lastUpdate.toLocaleTimeString()}
                  </small>
                </div>
                <div className="d-flex gap-2">
                  <Button
                    variant={autoRefresh ? "success" : "outline-secondary"}
                    size="sm"
                    onClick={() => setAutoRefresh(!autoRefresh)}
                  >
                    <i className={`bi bi-${autoRefresh ? "pause" : "play"}-circle`}></i>
                    {autoRefresh ? "Live" : "Manual"}
                  </Button>
                  <Button variant="outline-primary" size="sm" onClick={fetchAllData}>
                    <i className="bi bi-arrow-clockwise"></i>
                    Refresh
                  </Button>
                </div>
              </div>
            </Card.Body>
          </Card>
        </Col>
        <Col md={4}>
          <Card className="border-0 shadow-sm bg-gradient-info text-white">
            <Card.Body>
              <div className="d-flex justify-content-between align-items-center">
                <div>
                  <h6 className="mb-1">Total Submissions</h6>
                  <h3 className="mb-0">{personalStats.totalSubmissions}</h3>
                </div>
                <i className="bi bi-file-earmark-text display-6 opacity-50"></i>
              </div>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      {/* Personal Performance Metrics */}
      <Row className="mb-4">
        <Col md={3}>
          <Card className="border-0 shadow-sm h-100">
            <Card.Body className="text-center">
              <div className="text-primary mb-2">
                <i className="bi bi-bullseye display-6"></i>
              </div>
              <h3 className="mb-1">{personalStats.accuracy}%</h3>
              <p className="mb-0">Accuracy Score</p>
              <ProgressBar
                variant={getPerformanceBadge(personalStats.accuracy)}
                now={personalStats.accuracy}
                className="mt-2"
                style={{ height: "4px" }}
              />
            </Card.Body>
          </Card>
        </Col>
        <Col md={3}>
          <Card className="border-0 shadow-sm h-100">
            <Card.Body className="text-center">
              <div className="text-warning mb-2">
                <i className="bi bi-fire display-6"></i>
              </div>
              <h3 className="mb-1">{personalStats.streak}</h3>
              <p className="mb-0">Day Streak</p>
              <ProgressBar
                variant="warning"
                now={Math.min(personalStats.streak * 10, 100)}
                className="mt-2"
                style={{ height: "4px" }}
              />
            </Card.Body>
          </Card>
        </Col>
        <Col md={3}>
          <Card className="border-0 shadow-sm h-100">
            <Card.Body className="text-center">
              <div className="text-info mb-2">
                <i className="bi bi-chat-text display-6"></i>
              </div>
              <h3 className="mb-1">{personalStats.avgWordsPerSubmission}</h3>
              <p className="mb-0">Avg Words</p>
              <ProgressBar
                variant="info"
                now={Math.min(personalStats.avgWordsPerSubmission / 2, 100)}
                className="mt-2"
                style={{ height: "4px" }}
              />
            </Card.Body>
          </Card>
        </Col>
        <Col md={3}>
          <Card className="border-0 shadow-sm h-100">
            <Card.Body className="text-center">
              <div className="text-success mb-2">
                <i className="bi bi-trophy display-6"></i>
              </div>
              <h3 className="mb-1">
                {personalStats.totalSubmissions > 50 ? "Expert" : 
                 personalStats.totalSubmissions > 20 ? "Advanced" : 
                 personalStats.totalSubmissions > 10 ? "Intermediate" : "Beginner"}
              </h3>
              <p className="mb-0">User Level</p>
              <ProgressBar
                variant="success"
                now={(personalStats.totalSubmissions / 100) * 100}
                className="mt-2"
                style={{ height: "4px" }}
              />
            </Card.Body>
          </Card>
        </Col>
      </Row>

      {/* Classification Stats Cards */}
      <Row className="mb-4">
        {Object.entries(summary).map(([type, count]) => (
          <Col md={4} key={type}>
            <Card className="border-0 shadow-sm h-100">
              <Card.Body className="text-center">
                <div className={`text-${THREAT_LEVELS[type].color} mb-2`}>
                  <i className={`bi bi-${THREAT_LEVELS[type].icon} display-6`}></i>
                </div>
                <h3 className="mb-1">{count}</h3>
                <p className="text-capitalize mb-0">{type} Reports</p>
                <ProgressBar
                  variant={THREAT_LEVELS[type].color}
                  now={submissions.length ? (count / submissions.length) * 100 : 0}
                  className="mt-2"
                  style={{ height: "4px" }}
                />
              </Card.Body>
            </Card>
          </Col>
        ))}
      </Row>

      {/* Charts Row */}
      <Row className="mb-4">
        <Col md={6}>
          <Card className="border-0 shadow-sm">
            <Card.Header className="bg-light">
              <h6 className="mb-0">Your Classification Distribution</h6>
            </Card.Header>
            <Card.Body style={{ height: 300 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={60}
                    outerRadius={100}
                    label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                  >
                    {pieData.map((entry, idx) => (
                      <Cell key={idx} fill={entry.color} />
                    ))}
                  </Pie>
                  <RechartsTooltip />
                </PieChart>
              </ResponsiveContainer>
            </Card.Body>
          </Card>
        </Col>
        <Col md={6}>
          <Card className="border-0 shadow-sm">
            <Card.Header className="bg-light">
              <h6 className="mb-0">Weekly Activity Trend (7 days)</h6>
            </Card.Header>
            <Card.Body style={{ height: 300 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={weeklyTrend}>
                  <XAxis dataKey="date" />
                  <YAxis />
                  <RechartsTooltip />
                  <Area 
                    type="monotone" 
                    dataKey="total" 
                    stroke="#007bff" 
                    fill="#007bff" 
                    fillOpacity={0.3}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      {/* Keywords and Quick Submit */}
      <Row className="mb-4">
        <Col md={6}>
          <Card className="border-0 shadow-sm">
            <Card.Header className="bg-light">
              <h6 className="mb-0">Your Most Used Keywords</h6>
            </Card.Header>
            <Card.Body style={{ maxHeight: 300, overflowY: "auto" }}>
              {topKeywords.length ? (
                topKeywords.map((keyword, idx) => (
                  <div key={idx} className="d-flex justify-content-between align-items-center mb-2">
                    <div>
                      <Badge bg={getEntityBadgeColor(keyword.label)} className="me-2">
                        {keyword.label}
                      </Badge>
                      <strong>{keyword.text}</strong>
                    </div>
                    <Badge bg="secondary">{keyword.count}</Badge>
                  </div>
                ))
              ) : (
                <div className="text-center text-muted">
                  <i className="bi bi-search display-6"></i>
                  <p>Submit reports to see keyword analysis</p>
                </div>
              )}
            </Card.Body>
          </Card>
        </Col>
        <Col md={6}>
          <Card className="border-0 shadow-sm">
            <Card.Header className="bg-primary text-white">
              <h6 className="mb-0">
                <i className="bi bi-plus-circle me-2"></i>
                Quick Report Submission
              </h6>
            </Card.Header>
            <Card.Body>
              <Form>
                <Form.Group className="mb-3">
                  <Form.Control
                    as="textarea"
                    rows={3}
                    placeholder="Enter your intelligence report or communication for analysis..."
                    value={reportText}
                    onChange={(e) => setReportText(e.target.value)}
                  />
                </Form.Group>
                <div className="d-flex gap-2">
                  <Button 
                    onClick={handleSubmit} 
                    disabled={submitting || !reportText.trim()}
                    variant="primary"
                  >
                    {submitting ? (
                      <>
                        <Spinner size="sm" className="me-2" />
                        Analyzing...
                      </>
                    ) : (
                      <>
                        <i className="bi bi-send me-2"></i>
                        Submit & Analyze
                      </>
                    )}
                  </Button>
                </div>
              </Form>
              <hr />
              <Form.Group>
                <Form.Label className="small">Or upload PDF document:</Form.Label>
                <Form.Control
                  type="file"
                  accept="application/pdf"
                  onChange={handlePdfUpload}
                  disabled={submitting}
                  size="sm"
                />
              </Form.Group>
              
              {/* Status Display */}
              {submitting && (
                <Alert variant="info" className="mt-3 mb-0">
                  <div className="d-flex align-items-center">
                    <Spinner size="sm" className="me-2" />
                    <div>
                      <strong>Processing...</strong><br/>
                      <small>Analyzing content and determining classification</small>
                    </div>
                  </div>
                </Alert>
              )}
            </Card.Body>
          </Card>
        </Col>
      </Row>

      {/* Filter Controls Row */}
      <Row className="mb-4">
        <Col md={12}>
          <Card className="border-0 shadow-sm">
            <Card.Header className="bg-light">
              <h6 className="mb-0">Filter & Search Your Submissions</h6>
            </Card.Header>
            <Card.Body>
              <Row className="g-2">
                <Col md={3}>
                  <InputGroup size="sm">
                    <InputGroup.Text>
                      <i className="bi bi-search"></i>
                    </InputGroup.Text>
                    <Form.Control
                      placeholder="Search your reports..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </InputGroup>
                </Col>
                <Col md={3}>
                  <Form.Select 
                    size="sm"
                    value={filterClassification}
                    onChange={(e) => setFilterClassification(e.target.value)}
                  >
                    <option value="all">All Classifications</option>
                    <option value="critical">Critical Only</option>
                    <option value="suspicious">Suspicious Only</option>
                    <option value="benign">Benign Only</option>
                  </Form.Select>
                </Col>
                <Col md={3}>
                  <Form.Select 
                    size="sm"
                    value={filterDateRange}
                    onChange={(e) => setFilterDateRange(e.target.value)}
                  >
                    <option value="all">All Time</option>
                    <option value="7">Last 7 days</option>
                    <option value="30">Last 30 days</option>
                    <option value="90">Last 3 months</option>
                  </Form.Select>
                </Col>
                <Col md={3}>
                  <ButtonGroup size="sm">
                    <Dropdown>
                      <Dropdown.Toggle variant="outline-secondary">
                        <i className="bi bi-sort-down me-1"></i>
                        Sort: {sortBy}
                      </Dropdown.Toggle>
                      <Dropdown.Menu>
                        <Dropdown.Item onClick={() => setSortBy("date")}>Date</Dropdown.Item>
                        <Dropdown.Item onClick={() => setSortBy("threat")}>Classification</Dropdown.Item>
                        <Dropdown.Item onClick={() => setSortBy("length")}>Text Length</Dropdown.Item>
                      </Dropdown.Menu>
                    </Dropdown>
                    <Button
                      variant="outline-secondary"
                      onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")}
                    >
                      <i className={`bi bi-sort-${sortOrder === "asc" ? "up" : "down"}`}></i>
                    </Button>
                  </ButtonGroup>
                </Col>
              </Row>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      {/* Submissions Table */}
      <Card className="border-0 shadow-sm">
        <Card.Header className="bg-light">
          <div className="d-flex justify-content-between align-items-center">
            <h6 className="mb-0">Your Submissions ({filteredSubmissions.length})</h6>
            <small className="text-muted">Click any submission for detailed analysis</small>
          </div>
        </Card.Header>
        <Card.Body className="p-0">
          {loading ? (
            <div className="text-center p-4">
              <Spinner className="me-2" />
              Loading your submissions...
            </div>
          ) : (
            <Table hover className="mb-0">
              <thead className="table-light">
                <tr>
                  <th>Date/Time</th>
                  <th>Report Preview</th>
                  <th>Classification</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredSubmissions.length ? (
                  filteredSubmissions.map((sub) => (
                    <tr key={sub.id} style={{ cursor: "pointer" }}>
                      <td className="small">
                        {new Date(sub.created_at).toLocaleDateString()}<br/>
                        <span className="text-muted">
                          {new Date(sub.created_at).toLocaleTimeString()}
                        </span>
                      </td>
                      <td 
                        onClick={() => handleSubmissionClick(sub)}
                        className="text-truncate"
                        style={{ maxWidth: "300px" }}
                      >
                        {sub.text}
                      </td>
                      <td>
                        <OverlayTrigger
                          overlay={<Tooltip>Threat Level: {THREAT_LEVELS[sub.classification].level}</Tooltip>}
                        >
                          <Badge bg={THREAT_LEVELS[sub.classification].color}>
                            <i className={`bi bi-${THREAT_LEVELS[sub.classification].icon} me-1`}></i>
                            {sub.classification.toUpperCase()}
                          </Badge>
                        </OverlayTrigger>
                      </td>
                      <td>
                        <Button
                          size="sm"
                          variant="outline-primary"
                          onClick={() => handleSubmissionClick(sub)}
                        >
                          <i className="bi bi-eye"></i>
                          View
                        </Button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="text-center py-4">
                      <i className="bi bi-inbox display-6 text-muted"></i>
                      <p className="mt-2 mb-0">No submissions match your current filters</p>
                      <small className="text-muted">Submit your first report to get started!</small>
                    </td>
                  </tr>
                )}
              </tbody>
            </Table>
          )}
        </Card.Body>
      </Card>

      {/* Detailed Submission Analysis Modal */}
      <Modal show={showDetailModal} onHide={() => setShowDetailModal(false)} size="lg">
        <Modal.Header closeButton>
          <Modal.Title>
            <i className="bi bi-file-earmark-text me-2"></i>
            Submission Analysis
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {selectedSubmission && (
            <div>
              {/* Submission Header Info */}
              <Row className="mb-3">
                <Col md={6}>
                  <Card className="border-0 bg-light">
                    <Card.Body className="py-2">
                      <small className="text-muted">SUBMITTED BY</small>
                      <div className="fw-bold">You</div>
                    </Card.Body>
                  </Card>
                </Col>
                <Col md={6}>
                  <Card className="border-0 bg-light">
                    <Card.Body className="py-2">
                      <small className="text-muted">SUBMITTED ON</small>
                      <div className="fw-bold">
                        {new Date(selectedSubmission.created_at).toLocaleString()}
                      </div>
                    </Card.Body>
                  </Card>
                </Col>
              </Row>

              {/* Classification Badge */}
              <div className="mb-3 text-center">
                <Badge 
                  bg={THREAT_LEVELS[selectedSubmission.classification].color}
                  className="px-4 py-2 fs-6"
                >
                  <i className={`bi bi-${THREAT_LEVELS[selectedSubmission.classification].icon} me-2`}></i>
                  CLASSIFIED AS: {selectedSubmission.classification.toUpperCase()}
                </Badge>
                {selectedSubmission.confidence && (
                  <div className="mt-2">
                    <small className="text-muted">
                      Confidence: {(selectedSubmission.confidence * 100).toFixed(1)}%
                    </small>
                  </div>
                )}
              </div>

              {/* Submission Content */}
              <Card className="mb-3">
                <Card.Header className="bg-info text-white">
                  <h6 className="mb-0">Your Submission Content</h6>
                </Card.Header>
                <Card.Body>
                  <p className="mb-0" style={{ whiteSpace: "pre-wrap", lineHeight: "1.6" }}>
                    {selectedSubmission.text}
                  </p>
                </Card.Body>
              </Card>

              {/* Entity Analysis */}
              {selectedSubmission.entities && selectedSubmission.entities.length > 0 && (
                <Card className="mb-3">
                  <Card.Header className="bg-primary text-white">
                    <h6 className="mb-0">
                      <i className="bi bi-tags me-2"></i>
                      Extracted Keywords & Entities
                    </h6>
                  </Card.Header>
                  <Card.Body>
                    <Row>
                      {selectedSubmission.entities.map((entity, idx) => (
                        <Col md={6} key={idx} className="mb-2">
                          <div className="d-flex align-items-center">
                            <Badge 
                              bg={getEntityBadgeColor(entity.label)} 
                              className="me-2"
                            >
                              {entity.label}
                            </Badge>
                            <span className="fw-bold">{entity.text}</span>
                          </div>
                        </Col>
                      ))}
                    </Row>
                    
                    {/* Entity Categories Explanation */}
                    <hr />
                    <small className="text-muted">
                      <strong>Entity Types:</strong> 
                      <Badge bg="primary" className="ms-2 me-1">PERSON</Badge> People/Names
                      <Badge bg="info" className="ms-1 me-1">GPE</Badge> Locations
                      <Badge bg="secondary" className="ms-1 me-1">TIME</Badge> Dates/Times
                      <Badge bg="danger" className="ms-1 me-1">WEAPON</Badge> Weapons/Threats
                      <Badge bg="warning" className="ms-1">ORG</Badge> Organizations
                    </small>
                  </Card.Body>
                </Card>
              )}

              {/* Analysis Results */}
              <Card>
                <Card.Header className="bg-success text-white">
                  <h6 className="mb-0">
                    <i className="bi bi-clipboard-data me-2"></i>
                    Analysis Results & Insights
                  </h6>
                </Card.Header>
                <Card.Body>
                  {selectedSubmission.classification === "critical" && (
                    <Alert variant="danger">
                      <Alert.Heading>Critical Classification</Alert.Heading>
                      <p className="mb-0">
                        Your submission has been classified as CRITICAL priority. 
                        This indicates potential high-priority content that requires attention:
                      </p>
                      <ul className="mb-0 mt-2">
                        <li>Contains keywords associated with urgent situations</li>
                        <li>May reference sensitive or time-critical information</li>
                        <li>Requires immediate review by relevant personnel</li>
                        <li>Consider providing additional context if needed</li>
                      </ul>
                    </Alert>
                  )}
                  
                  {selectedSubmission.classification === "suspicious" && (
                    <Alert variant="warning">
                      <Alert.Heading>Suspicious Classification</Alert.Heading>
                      <p className="mb-0">
                        Your submission has been flagged as SUSPICIOUS. 
                        This means it contains content that warrants monitoring:
                      </p>
                      <ul className="mb-0 mt-2">
                        <li>Contains patterns that require further analysis</li>
                        <li>May include keywords of moderate concern</li>
                        <li>Will be reviewed as part of ongoing monitoring</li>
                        <li>Consider clarifying ambiguous references</li>
                      </ul>
                    </Alert>
                  )}
                  
                  {selectedSubmission.classification === "benign" && (
                    <Alert variant="success">
                      <Alert.Heading>Benign Classification</Alert.Heading>
                      <p className="mb-0">
                        Your submission has been classified as BENIGN. 
                        This indicates routine content with no immediate concerns:
                      </p>
                      <ul className="mb-0 mt-2">
                        <li>Contains standard communication patterns</li>
                        <li>No suspicious keywords or patterns detected</li>
                        <li>Processed through normal channels</li>
                        <li>Continue submitting similar content as needed</li>
                      </ul>
                    </Alert>
                  )}

                  {/* Additional Submission Context */}
                  <div className="mt-3">
                    <h6>Submission Statistics</h6>
                    <Row>
                      <Col md={3}>
                        <small className="text-muted">WORD COUNT</small>
                        <div className="fw-bold">{selectedSubmission.text.split(' ').length}</div>
                      </Col>
                      <Col md={3}>
                        <small className="text-muted">CHARACTER COUNT</small>
                        <div className="fw-bold">{selectedSubmission.text.length}</div>
                      </Col>
                      <Col md={3}>
                        <small className="text-muted">ENTITIES FOUND</small>
                        <div className="fw-bold">
                          {selectedSubmission.entities ? selectedSubmission.entities.length : 0}
                        </div>
                      </Col>
                      <Col md={3}>
                        <small className="text-muted">SUBMISSION ID</small>
                        <div className="fw-bold">#{selectedSubmission.id}</div>
                      </Col>
                    </Row>
                  </div>

                  {/* Performance Feedback */}
                  <div className="mt-3">
                    <h6>Performance Insights</h6>
                    <div className="d-flex align-items-center">
                      <i className="bi bi-lightbulb text-warning me-2"></i>
                      <small className="text-muted">
                        {selectedSubmission.classification === "critical" 
                          ? "Great job identifying critical content! Your attention to detail helps maintain security."
                          : selectedSubmission.classification === "suspicious"
                          ? "Good catch on potentially suspicious content. Continue monitoring similar patterns."
                          : "Your submission follows normal patterns. Keep contributing valuable intelligence."
                        }
                      </small>
                    </div>
                  </div>
                </Card.Body>
              </Card>
            </div>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline-secondary" onClick={() => setShowDetailModal(false)}>
            Close Analysis
          </Button>
          <Button variant="success">
            <i className="bi bi-download me-2"></i>
            Export Report
          </Button>
          <Button variant="primary">
            <i className="bi bi-arrow-repeat me-2"></i>
            Resubmit Similar
          </Button>
        </Modal.Footer>
      </Modal>
    </DashboardLayout>
  );
}