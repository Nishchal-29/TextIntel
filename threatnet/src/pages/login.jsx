import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Container, Row, Col, Card, Form, Button, Alert, Spinner } from "react-bootstrap";
import { ShieldLock, PersonFill, AwardFill } from "react-bootstrap-icons";
import { useAuth } from "../auth/AuthContext";

const roles = [
  {
    role: "User",
    icon: <PersonFill size={32} color="#0d6efd" />,
    desc: "Standard access for viewing general information and submitting reports.",
  },
  {
    role: "Commander",
    icon: <AwardFill size={32} color="#ffc107" />,
    desc: "High-level access to mission data, field reports, and coordination tools.",
  },
  {
    role: "Admin",
    icon: <ShieldLock size={32} color="#dc3545" />,
    desc: "Full control over system settings, user permissions, and infrastructure.",
  },
];

export default function Login() {
  const [flippedRole, setFlippedRole] = useState("");
  const [credentials, setCredentials] = useState({
    User: { username: "", password: "" },
    Commander: { username: "", password: "" },
    Admin: { username: "", password: "" },
  });
  const [localError, setLocalError] = useState({});
  const navigate = useNavigate();
  const location = useLocation();
  const { login, loading, error: globalError } = useAuth();

  const handleFlipToggle = (role) => {
    setFlippedRole((prev) => (prev === role ? "" : role));
  };

  const handleChange = (role, field, value) => {
    setCredentials((prev) => ({
      ...prev,
      [role]: { ...prev[role], [field]: value },
    }));
    setLocalError((prev) => ({ ...prev, [role]: null }));
  };

  const submitLogin = async (role) => {
    const { username, password } = credentials[role];
    if (!username || !password) {
      setLocalError((prev) => ({ ...prev, [role]: "Username and password required" }));
      return;
    }
    try {
      await login({ username, password, role });
      const from = location.state?.from?.pathname || `/${role.toLowerCase()}`;
      navigate(from, { replace: true });
    } catch (e) {
      setLocalError((prev) => ({
        ...prev,
        [role]: e.response?.data?.error || "Login failed",
      }));
    }
  };

  const handleFlipKey = (e, role) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleFlipToggle(role);
    }
  };

  return (
    <>
      <div className="login-bg text-white py-5">
        <div className="radar-overlay" />
        <Container className="text-white py-5 position-relative" style={{ zIndex: 2 }}>
          <h1 className="text-center mb-4 text-success fw-bold">🛡️ TEXTINTEL Login Portal</h1>
          <p className="text-center text-secondary mb-5 fs-5">
            Select your role to access the secure portal
          </p>
          <Row className="justify-content-center">
            {roles.map(({ role, icon, desc }) => (
              <Col key={role} md={4} className="mb-4 d-flex justify-content-center">
                <div
                  className={`flip-card ${flippedRole === role ? "flipped" : ""}`}
                  tabIndex={0}
                  aria-label={`${role} login card`}
                  style={{ outline: "none" }}
                  {...(flippedRole !== role && {
                    onClick: () => handleFlipToggle(role),
                    onKeyDown: (e) => handleFlipKey(e, role),
                  })}
                >
                  <div className="flip-card-inner">
                    {/* Front Side */}
                    <Card className="flip-card-front glossy-card text-center p-4 text-white">
                      <div className="mb-2 fs-2">{icon}</div>
                      <Card.Title className="fs-4 fw-bold text-glow">{role} Login</Card.Title>
                      <Card.Text className="gradient-text small">{desc}</Card.Text>
                      <div
                        className="mt-2 text-info"
                        role="button"
                        tabIndex={0}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleFlipToggle(role);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            handleFlipToggle(role);
                          }
                        }}
                      >
                        Click to Login
                      </div>
                    </Card>

                    {/* Back Side */}
                    <Card className="flip-card-back glossy-card text-white p-4">
                      <div
                        style={{
                          position: "absolute",
                          top: 8,
                          right: 12,
                          fontSize: 18,
                          cursor: "pointer",
                          fontWeight: "bold",
                        }}
                        aria-label="Close"
                        role="button"
                        tabIndex={0}
                        onClick={(e) => {
                          e.stopPropagation();
                          setFlippedRole("");
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setFlippedRole("");
                          }
                        }}
                      >
                        ×
                      </div>

                      <Card.Title className="text-center text-warning fw-bold">{role} Login</Card.Title>
                      <Form
                        className="mt-3"
                        onSubmit={(e) => {
                          e.preventDefault();
                          submitLogin(role);
                        }}
                      >
                        {localError[role] && (
                          <Alert variant="danger" className="py-1">
                            {localError[role]}
                          </Alert>
                        )}
                        <Form.Group controlId={`username-${role}`} className="mb-2">
                          <Form.Control
                            type="text"
                            placeholder="Username"
                            aria-label="Username"
                            value={credentials[role].username}
                            onChange={(e) => handleChange(role, "username", e.target.value)}
                            className="mb-3 rounded-pill text-center"
                          />
                        </Form.Group>
                        <Form.Group controlId={`password-${role}`} className="mb-2">
                          <Form.Control
                            type="password"
                            placeholder="Password"
                            aria-label="Password"
                            value={credentials[role].password}
                            onChange={(e) => handleChange(role, "password", e.target.value)}
                            className="mb-3 rounded-pill text-center"
                          />
                        </Form.Group>
                        <Button
                          variant="success"
                          className="w-100 fw-semibold rounded-pill"
                          type="submit"
                          disabled={loading}
                        >
                          {loading ? (
                            <>
                              <Spinner as="span" animation="border" size="sm" /> Signing in...
                            </>
                          ) : (
                            "Access Portal"
                          )}
                        </Button>
                      </Form>
                      {globalError && (
                        <div className="mt-2 text-danger small text-center">{globalError}</div>
                      )}
                    </Card>
                  </div>
                </div>
              </Col>
            ))}
          </Row>
        </Container>

        {/* CSS STYLES */}
        <style>{`
          .login-bg {
            min-height: 100vh;
            position: relative;
            overflow: hidden;
            background: radial-gradient(circle at center, #000000 0%, #1a1a1a 80%, #000000 100%);
          }

          .radar-overlay {
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background:
              repeating-radial-gradient(
                circle at center,
                rgba(0, 255, 0, 0.15) 0px,
                rgba(0, 255, 0, 0.15) 2px,
                transparent 2px,
                transparent 10px
              ),
              repeating-radial-gradient(
                circle at center,
                rgba(0, 255, 0, 0.05) 0px,
                rgba(0, 255, 0, 0.05) 10px,
                transparent 10px,
                transparent 20px
              );
            animation: rotateRadar 10s linear infinite;
            z-index: 1;
            opacity: 0.5;
          }

          @keyframes rotateRadar {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }

          .flip-card {
            width: 320px;
            height: 320px;
            perspective: 1000px;
          }

          .flip-card-inner {
            position: relative;
            width: 100%;
            height: 100%;
            transition: transform 0.5s ease;
            transform-style: preserve-3d;
          }

          .flip-card.flipped .flip-card-inner {
            transform: rotateY(180deg);
          }

          .flip-card-front,
          .flip-card-back {
            backface-visibility: hidden;
            border-radius: 1rem;
            display: flex;
            flex-direction: column;
            justify-content: center;
            position: absolute;
            width: 100%;
            height: 100%;
          }

          .flip-card-back {
            transform: rotateY(180deg);
          }

          .glossy-card {
            background: linear-gradient(145deg, #000000, #1a1a1a);
            border: 1px solid rgba(255, 255, 255, 0.1);
            box-shadow:
              inset 0 0 20px rgba(255, 255, 255, 0.05),
              0 0 20px rgba(0, 255, 100, 0.3);
            transition: transform 0.3s, box-shadow 0.3s;
          }

          /* Hover only when not flipped */
          .flip-card:not(.flipped) .glossy-card:hover {
            transform: scale(1.03);
            box-shadow:
              0 0 30px rgba(0, 255, 100, 0.5),
              inset 0 0 10px rgba(255, 255, 255, 0.1);
          }

          .text-glow {
            text-shadow: 0 0 10px #00ffcc;
          }

          .gradient-text {
            background: linear-gradient(90deg, #ffffff, gold);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
            color: transparent;
          }

          .flip-card:focus-visible {
            outline: 3px solid #00ffcc;
          }
        `}</style>
      </div>
    </>
  );
}
