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

export default function CommanderDashboard() {
  const { authAxios } = useAuth();
  
  // State for messages and analytics
  const [messages, setMessages] = useState([]);
  const [filteredMessages, setFilteredMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  
  // State for new submission
  const [reportText, setReportText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [pdfFile, setPdfFile] = useState(null);
  
  // State for analytics
  const [summary, setSummary] = useState({ benign: 0, suspicious: 0, critical: 0 });
  const [dailyTrend, setDailyTrend] = useState([]);
  const [topUsers, setTopUsers] = useState([]);
  const [entityAnalysis, setEntityAnalysis] = useState([]);
  const [threatIntel, setThreatIntel] = useState([]);
  
  // State for filters and search
  const [searchTerm, setSearchTerm] = useState("");
  const [filterClassification, setFilterClassification] = useState("all");
  const [filterDateRange, setFilterDateRange] = useState("7");
  const [sortBy, setSortBy] = useState("date");
  const [sortOrder, setSortOrder] = useState("desc");
  
  // State for real-time updates
  const [lastUpdate, setLastUpdate] = useState(new Date());
  const [autoRefresh, setAutoRefresh] = useState(true);
  const intervalRef = useRef(null);

  // Initial data fetch
  useEffect(() => {
    fetchAllData();
  }, []);

  // State for notifications
  const [notification, setNotification] = useState(null);

  // Auto-refresh setup
  useEffect(() => {
    if (autoRefresh) {
      intervalRef.current = setInterval(() => {
        fetchAllData();
        setLastUpdate(new Date());
      }, 30000); // Refresh every 30 seconds
    } else {
      clearInterval(intervalRef.current);
    }
    return () => clearInterval(intervalRef.current);
  }, [autoRefresh]);

  // Filter and search effect
  useEffect(() => {
    let filtered = [...messages];
    
    // Apply search filter
    if (searchTerm) {
      filtered = filtered.filter(msg => 
        msg.text.toLowerCase().includes(searchTerm.toLowerCase()) ||
        msg.username?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    
    // Apply classification filter
    if (filterClassification !== "all") {
      filtered = filtered.filter(msg => msg.classification === filterClassification);
    }
    
    // Apply date range filter
    if (filterDateRange !== "all") {
      const days = parseInt(filterDateRange);
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);
      filtered = filtered.filter(msg => new Date(msg.created_at) >= cutoffDate);
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
        case "user":
          aVal = a.username || "";
          bVal = b.username || "";
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
    
    setFilteredMessages(filtered);
  }, [messages, searchTerm, filterClassification, filterDateRange, sortBy, sortOrder]);

  const fetchAllData = async () => {
    setLoading(true);
    try {
      await Promise.all([
        fetchMessages(),
        fetchEntityAnalysis(),
        fetchThreatIntelligence()
      ]);
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchMessages = async () => {
    try {
      // Try admin endpoint first, fallback to user endpoint if not authorized
      let res;
      try {
        res = await authAxios.get("/api/admin/messages");
      } catch (adminError) {
        // If admin endpoint fails, try user messages endpoint
        console.log("Admin endpoint failed, trying user endpoint");
        res = await authAxios.get("/api/messages/user");
      }
      const msgs = res.data.messages || [];
      setMessages(msgs);
      
      // Calculate summary stats
      const counts = { benign: 0, suspicious: 0, critical: 0 };
      msgs.forEach(msg => {
        counts[msg.classification] = (counts[msg.classification] || 0) + 1;
      });
      setSummary(counts);
      
      // Calculate daily trends
      const trendMap = {};
      msgs.forEach(msg => {
        const date = msg.created_at?.slice(0, 10) || "unknown";
        if (!trendMap[date]) {
          trendMap[date] = { date, benign: 0, suspicious: 0, critical: 0, total: 0 };
        }
        trendMap[date][msg.classification]++;
        trendMap[date].total++;
      });
      
      const trends = Object.values(trendMap)
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(-14); // Last 14 days
      setDailyTrend(trends);
      
      // Calculate top users
      const userMap = {};
      msgs.forEach(msg => {
        const user = msg.username || "Unknown";
        if (!userMap[user]) {
          userMap[user] = { user, total: 0, critical: 0, suspicious: 0, benign: 0 };
        }
        userMap[user].total++;
        userMap[user][msg.classification]++;
      });
      
      const topUsersData = Object.values(userMap)
        .sort((a, b) => b.total - a.total)
        .slice(0, 10);
      setTopUsers(topUsersData);
      
    } catch (error) {
      console.error("Error fetching messages:", error);
    }
  };

  const fetchEntityAnalysis = async () => {
    try {
      const entityMap = {};
      
      // Process recent critical and suspicious messages for entity extraction
      const criticalMessages = messages.filter(msg => 
        msg.classification === "critical" || msg.classification === "suspicious"
      ).slice(0, 50); // Limit to avoid too many API calls
      
      for (const msg of criticalMessages) {
        try {
          const res = await authAxios.post(
            `${import.meta.env.VITE_FASTAPI_BASE || ""}/ner`,
            { sentence: msg.text },
            { headers: { "Content-Type": "application/json" } }
          );
          
          if (res.data.entities) {
            res.data.entities.forEach(entity => {
              const key = `${entity.text.toLowerCase()}-${entity.label}`;
              if (!entityMap[key]) {
                entityMap[key] = {
                  text: entity.text,
                  label: entity.label,
                  count: 0,
                  messages: []
                };
              }
              entityMap[key].count++;
              entityMap[key].messages.push(msg.id);
            });
          }
        } catch (error) {
          console.error(`Error processing NER for message ${msg.id}:`, error);
        }
      }
      
      const sortedEntities = Object.values(entityMap)
        .sort((a, b) => b.count - a.count)
        .slice(0, 20);
      
      setEntityAnalysis(sortedEntities);
    } catch (error) {
      console.error("Error in entity analysis:", error);
    }
  };

  const fetchThreatIntelligence = async () => {
    try {
      // Generate threat intelligence based on patterns
      const threats = [];
      const weaponMentions = messages.filter(msg => 
        /\b(weapon|gun|bomb|explosive|attack|target|threat)\b/i.test(msg.text)
      );
      
      const locationMentions = messages.filter(msg =>
        /\b(base|camp|location|coordinates|position)\b/i.test(msg.text)
      );
      
      if (weaponMentions.length > 0) {
        threats.push({
          type: "Weapon References",
          count: weaponMentions.length,
          severity: weaponMentions.filter(m => m.classification === "critical").length > 0 ? "HIGH" : "MEDIUM",
          description: `${weaponMentions.length} messages contain weapon-related keywords`
        });
      }
      
      if (locationMentions.length > 0) {
        threats.push({
          type: "Location Intelligence", 
          count: locationMentions.length,
          severity: "MEDIUM",
          description: `${locationMentions.length} messages mention strategic locations`
        });
      }
      
      // Check for time-sensitive patterns
      const recentCritical = messages.filter(msg => {
        const msgDate = new Date(msg.created_at);
        const daysDiff = (new Date() - msgDate) / (1000 * 60 * 60 * 24);
        return daysDiff <= 1 && msg.classification === "critical";
      });
      
      if (recentCritical.length > 0) {
        threats.push({
          type: "Recent Critical Activity",
          count: recentCritical.length, 
          severity: "HIGH",
          description: `${recentCritical.length} critical messages in last 24 hours`
        });
      }
      
      setThreatIntel(threats);
    } catch (error) {
      console.error("Error generating threat intelligence:", error);
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

      // Step 3: Update UI immediately with the new message
      const newMessage = saveRes.data.message || {
        id: Date.now(),
        text: reportText,
        classification: predicted_class,
        confidence: confidence,
        created_at: new Date().toISOString(),
        username: "You" // Current user indicator
      };

      // Add to messages array at the beginning
      setMessages(prev => [newMessage, ...prev]);
      
      // Update summary immediately
      setSummary(prev => ({
        ...prev,
        [predicted_class]: (prev[predicted_class] || 0) + 1
      }));

      setReportText("");
      
      // Show success notification
      setNotification({
        type: 'success',
        message: `Successfully classified as ${predicted_class.toUpperCase()}`,
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
      const newMessage = saveRes.data.message || {
        id: Date.now(),
        text: input_text,
        classification: predicted_class,
        confidence: confidence,
        created_at: new Date().toISOString(),
        username: "You (PDF)" // Indicate PDF source
      };

      setMessages(prev => [newMessage, ...prev]);
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

  const handleMessageClick = async (message) => {
    setSelectedMessage(message);
    
    // Fetch additional details via NER
    try {
      const res = await authAxios.post(
        `${import.meta.env.VITE_FASTAPI_BASE || ""}/ner`,
        { sentence: message.text },
        { headers: { "Content-Type": "application/json" } }
      );
      setSelectedMessage(prev => ({ ...prev, entities: res.data.entities || [] }));
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

  const getSeverityBadge = (severity) => {
    const colors = { "HIGH": "danger", "MEDIUM": "warning", "LOW": "info" };
    return colors[severity] || "secondary";
  };

  return (
    <DashboardLayout title="Commander Intelligence Dashboard">
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
                    <i className="bi bi-shield-check text-primary me-2"></i>
                    Intelligence Overview
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
                    {autoRefresh ? "Live" : "Paused"}
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
          <Card className="border-0 shadow-sm bg-gradient-primary text-white">
            <Card.Body>
              <div className="d-flex justify-content-between align-items-center">
                <div>
                  <h6 className="mb-1">Total Intelligence Reports</h6>
                  <h3 className="mb-0">{messages.length}</h3>
                </div>
                <i className="bi bi-file-earmark-text display-6 opacity-50"></i>
              </div>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      {/* Threat Intelligence Alerts */}
      {threatIntel.length > 0 && (
        <Alert variant="warning" className="mb-4">
          <Alert.Heading>
            <i className="bi bi-exclamation-triangle me-2"></i>
            Active Threat Intelligence
          </Alert.Heading>
          <Row>
            {threatIntel.map((threat, idx) => (
              <Col md={4} key={idx}>
                <div className="d-flex align-items-center mb-2">
                  <Badge bg={getSeverityBadge(threat.severity)} className="me-2">
                    {threat.severity}
                  </Badge>
                  <strong>{threat.type}</strong>
                </div>
                <small>{threat.description}</small>
              </Col>
            ))}
          </Row>
        </Alert>
      )}

      {/* Stats Cards */}
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
                  now={(count / messages.length) * 100}
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
              <h6 className="mb-0">Classification Distribution</h6>
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
              <h6 className="mb-0">Daily Intelligence Trend (14 days)</h6>
            </Card.Header>
            <Card.Body style={{ height: 300 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={dailyTrend}>
                  <XAxis dataKey="date" />
                  <YAxis />
                  <RechartsTooltip />
                  <Area 
                    type="monotone" 
                    dataKey="critical" 
                    stackId="1" 
                    stroke={STATUS_COLORS.critical} 
                    fill={STATUS_COLORS.critical} 
                  />
                  <Area 
                    type="monotone" 
                    dataKey="suspicious" 
                    stackId="1" 
                    stroke={STATUS_COLORS.suspicious} 
                    fill={STATUS_COLORS.suspicious} 
                  />
                  <Area 
                    type="monotone" 
                    dataKey="benign" 
                    stackId="1" 
                    stroke={STATUS_COLORS.benign} 
                    fill={STATUS_COLORS.benign} 
                  />
                </AreaChart>
              </ResponsiveContainer>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      {/* Entity Analysis and Top Users */}
      <Row className="mb-4">
        <Col md={6}>
          <Card className="border-0 shadow-sm">
            <Card.Header className="bg-light">
              <h6 className="mb-0">Key Entity Intelligence</h6>
            </Card.Header>
            <Card.Body style={{ maxHeight: 300, overflowY: "auto" }}>
              {entityAnalysis.length ? (
                entityAnalysis.map((entity, idx) => (
                  <div key={idx} className="d-flex justify-content-between align-items-center mb-2">
                    <div>
                      <Badge bg={getEntityBadgeColor(entity.label)} className="me-2">
                        {entity.label}
                      </Badge>
                      <strong>{entity.text}</strong>
                    </div>
                    <Badge bg="secondary">{entity.count}</Badge>
                  </div>
                ))
              ) : (
                <div className="text-center text-muted">
                  <i className="bi bi-search display-6"></i>
                  <p>No entities extracted yet</p>
                </div>
              )}
            </Card.Body>
          </Card>
        </Col>
        <Col md={6}>
          <Card className="border-0 shadow-sm">
            <Card.Header className="bg-light">
              <h6 className="mb-0">Most Active Operatives</h6>
            </Card.Header>
            <Card.Body style={{ maxHeight: 300, overflowY: "auto" }}>
              {topUsers.map((user, idx) => (
                <div key={idx} className="d-flex justify-content-between align-items-center mb-2">
                  <div>
                    <strong>{user.user}</strong>
                    <div className="small text-muted">
                      {user.critical > 0 && <Badge bg="danger" size="sm" className="me-1">{user.critical}</Badge>}
                      {user.suspicious > 0 && <Badge bg="warning" size="sm" className="me-1">{user.suspicious}</Badge>}
                      {user.benign > 0 && <Badge bg="success" size="sm">{user.benign}</Badge>}
                    </div>
                  </div>
                  <Badge bg="primary">{user.total}</Badge>
                </div>
              ))}
            </Card.Body>
          </Card>
        </Col>
      </Row>

      <Row className="mb-4">
        <Col md={6}>
          <Card className="border-0 shadow-sm">
            <Card.Header className="bg-primary text-white">
              <h6 className="mb-0">
                <i className="bi bi-plus-circle me-2"></i>
                Quick Intelligence Submission
              </h6>
            </Card.Header>
            <Card.Body>
              <Form>
                <Form.Group className="mb-3">
                  <Form.Control
                    as="textarea"
                    rows={3}
                    placeholder="Enter intercepted communication or intelligence report..."
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
                        Submit & Classify
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
                      <small>Analyzing content and determining threat level</small>
                    </div>
                  </div>
                </Alert>
              )}
            </Card.Body>
          </Card>
        </Col>
        <Col md={6}>
          {/* Filter Controls */}
          <Card className="border-0 shadow-sm">
            <Card.Header className="bg-light">
              <h6 className="mb-0">Intelligence Filters</h6>
            </Card.Header>
            <Card.Body>
              <Row className="g-2">
                <Col md={6}>
                  <InputGroup size="sm">
                    <InputGroup.Text>
                      <i className="bi bi-search"></i>
                    </InputGroup.Text>
                    <Form.Control
                      placeholder="Search reports..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </InputGroup>
                </Col>
                <Col md={6}>
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
                <Col md={6}>
                  <Form.Select 
                    size="sm"
                    value={filterDateRange}
                    onChange={(e) => setFilterDateRange(e.target.value)}
                  >
                    <option value="all">All Time</option>
                    <option value="1">Last 24 hours</option>
                    <option value="7">Last 7 days</option>
                    <option value="30">Last 30 days</option>
                  </Form.Select>
                </Col>
                <Col md={6}>
                  <ButtonGroup size="sm">
                    <Dropdown>
                      <Dropdown.Toggle variant="outline-secondary">
                        <i className="bi bi-sort-down me-1"></i>
                        Sort: {sortBy}
                      </Dropdown.Toggle>
                      <Dropdown.Menu>
                        <Dropdown.Item onClick={() => setSortBy("date")}>Date</Dropdown.Item>
                        <Dropdown.Item onClick={() => setSortBy("threat")}>Threat Level</Dropdown.Item>
                        <Dropdown.Item onClick={() => setSortBy("user")}>User</Dropdown.Item>
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

      {/* Intelligence Reports Table */}
      <Card className="border-0 shadow-sm">
        <Card.Header className="bg-light">
          <div className="d-flex justify-content-between align-items-center">
            <h6 className="mb-0">Intelligence Reports ({filteredMessages.length})</h6>
            <small className="text-muted">Click any report for detailed analysis</small>
          </div>
        </Card.Header>
        <Card.Body className="p-0">
          {loading ? (
            <div className="text-center p-4">
              <Spinner className="me-2" />
              Loading intelligence data...
            </div>
          ) : (
            <Table hover className="mb-0">
              <thead className="table-light">
                <tr>
                  <th>Date/Time</th>
                  <th>Operative</th>
                  <th>Intelligence Summary</th>
                  <th>Classification</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredMessages.length ? (
                  filteredMessages.map((msg) => (
                    <tr key={msg.id} style={{ cursor: "pointer" }}>
                      <td className="small">
                        {new Date(msg.created_at).toLocaleDateString()}<br/>
                        <span className="text-muted">
                          {new Date(msg.created_at).toLocaleTimeString()}
                        </span>
                      </td>
                      <td>
                        <Badge bg="info" className="me-1">
                          <i className="bi bi-person"></i>
                        </Badge>
                        {msg.username || "Unknown"}
                      </td>
                      <td 
                        onClick={() => handleMessageClick(msg)}
                        className="text-truncate"
                        style={{ maxWidth: "300px" }}
                      >
                        {msg.text}
                      </td>
                      <td>
                        <OverlayTrigger
                          overlay={<Tooltip>Threat Level: {THREAT_LEVELS[msg.classification].level}</Tooltip>}
                        >
                          <Badge bg={THREAT_LEVELS[msg.classification].color}>
                            <i className={`bi bi-${THREAT_LEVELS[msg.classification].icon} me-1`}></i>
                            {msg.classification.toUpperCase()}
                          </Badge>
                        </OverlayTrigger>
                      </td>
                      <td>
                        <Button
                          size="sm"
                          variant="outline-primary"
                          onClick={() => handleMessageClick(msg)}
                        >
                          <i className="bi bi-eye"></i>
                          Analyze
                        </Button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="text-center py-4">
                      <i className="bi bi-inbox display-6 text-muted"></i>
                      <p className="mt-2 mb-0">No intelligence reports match your current filters</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </Table>
          )}
        </Card.Body>
      </Card>

      {/* Detailed Message Analysis Modal */}
      <Modal show={showDetailModal} onHide={() => setShowDetailModal(false)} size="lg">
        <Modal.Header closeButton>
          <Modal.Title>
            <i className="bi bi-file-earmark-text me-2"></i>
            Intelligence Report Analysis
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {selectedMessage && (
            <div>
              {/* Message Header Info */}
              <Row className="mb-3">
                <Col md={6}>
                  <Card className="border-0 bg-light">
                    <Card.Body className="py-2">
                      <small className="text-muted">OPERATIVE</small>
                      <div className="fw-bold">{selectedMessage.username || "Unknown"}</div>
                    </Card.Body>
                  </Card>
                </Col>
                <Col md={6}>
                  <Card className="border-0 bg-light">
                    <Card.Body className="py-2">
                      <small className="text-muted">TIMESTAMP</small>
                      <div className="fw-bold">
                        {new Date(selectedMessage.created_at).toLocaleString()}
                      </div>
                    </Card.Body>
                  </Card>
                </Col>
              </Row>

              {/* Classification Badge */}
              <div className="mb-3 text-center">
                <Badge 
                  bg={THREAT_LEVELS[selectedMessage.classification].color}
                  className="px-4 py-2 fs-6"
                >
                  <i className={`bi bi-${THREAT_LEVELS[selectedMessage.classification].icon} me-2`}></i>
                  THREAT LEVEL: {selectedMessage.classification.toUpperCase()}
                </Badge>
              </div>

              {/* Message Content */}
              <Card className="mb-3">
                <Card.Header className="bg-primary text-white">
                  <h6 className="mb-0">Intelligence Content</h6>
                </Card.Header>
                <Card.Body>
                  <p className="mb-0" style={{ whiteSpace: "pre-wrap", lineHeight: "1.6" }}>
                    {selectedMessage.text}
                  </p>
                </Card.Body>
              </Card>

              {/* Entity Analysis */}
              {selectedMessage.entities && selectedMessage.entities.length > 0 && (
                <Card className="mb-3">
                  <Card.Header className="bg-info text-white">
                    <h6 className="mb-0">
                      <i className="bi bi-tags me-2"></i>
                      Extracted Intelligence Entities
                    </h6>
                  </Card.Header>
                  <Card.Body>
                    <Row>
                      {selectedMessage.entities.map((entity, idx) => (
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

              {/* Risk Assessment */}
              <Card>
                <Card.Header className="bg-warning text-dark">
                  <h6 className="mb-0">
                    <i className="bi bi-shield-exclamation me-2"></i>
                    Risk Assessment & Recommendations
                  </h6>
                </Card.Header>
                <Card.Body>
                  {selectedMessage.classification === "critical" && (
                    <Alert variant="danger">
                      <Alert.Heading>HIGH PRIORITY THREAT</Alert.Heading>
                      <p className="mb-0">
                        This intelligence report has been classified as CRITICAL. 
                        Immediate action may be required. Consider:
                      </p>
                      <ul className="mb-0 mt-2">
                        <li>Escalate to higher command immediately</li>
                        <li>Verify information through additional sources</li>
                        <li>Implement defensive measures if locations are mentioned</li>
                        <li>Monitor related communication channels</li>
                      </ul>
                    </Alert>
                  )}
                  
                  {selectedMessage.classification === "suspicious" && (
                    <Alert variant="warning">
                      <Alert.Heading>MODERATE THREAT</Alert.Heading>
                      <p className="mb-0">
                        This report contains suspicious content that requires monitoring. 
                        Recommended actions:
                      </p>
                      <ul className="mb-0 mt-2">
                        <li>Continue monitoring for related activity</li>
                        <li>Cross-reference with recent intelligence</li>
                        <li>Alert relevant units if entities match known threats</li>
                      </ul>
                    </Alert>
                  )}
                  
                  {selectedMessage.classification === "benign" && (
                    <Alert variant="success">
                      <Alert.Heading>LOW RISK</Alert.Heading>
                      <p className="mb-0">
                        This report appears to contain routine communication with no immediate threats identified.
                        Continue standard monitoring procedures.
                      </p>
                    </Alert>
                  )}

                  {/* Additional Intelligence Context */}
                  <div className="mt-3">
                    <h6>Intelligence Context</h6>
                    <div className="row">
                      <div className="col-md-4">
                        <small className="text-muted">WORD COUNT</small>
                        <div className="fw-bold">{selectedMessage.text.split(' ').length}</div>
                      </div>
                      <div className="col-md-4">
                        <small className="text-muted">ENTITIES FOUND</small>
                        <div className="fw-bold">
                          {selectedMessage.entities ? selectedMessage.entities.length : 0}
                        </div>
                      </div>
                      <div className="col-md-4">
                        <small className="text-muted">REPORT ID</small>
                        <div className="fw-bold">#{selectedMessage.id}</div>
                      </div>
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
          <Button variant="primary">
            <i className="bi bi-download me-2"></i>
            Export Report
          </Button>
        </Modal.Footer>
      </Modal>
    </DashboardLayout>
  );
}