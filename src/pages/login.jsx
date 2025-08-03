import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Container, Row, Col, Card, Form, Button } from "react-bootstrap";
import { ShieldLock, PersonFill, AwardFill } from "react-bootstrap-icons";

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
  const navigate = useNavigate();

  const handleLogin = (role) => {
    navigate(`/${role.toLowerCase()}`);
  };

  return (
    <>
      <div className="login-bg text-white py-5">
        <div className="radar-overlay"></div>
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
                  onClick={() => setFlippedRole(flippedRole === role ? "" : role)}
                >
                  <div className="flip-card-inner">
                    <Card className="flip-card-front glossy-card text-center p-4 text-white">
                      <div className="mb-2 fs-2">{icon}</div>
                      <Card.Title className="fs-4 fw-bold text-glow">{role} Login</Card.Title>
                      <Card.Text className="gradient-text small">{desc}</Card.Text>
                      <div className="mt-2 text-info">Click to Login</div>
                    </Card>

                    <Card className="flip-card-back glossy-card text-white p-4">
                      <Card.Title className="text-center text-warning fw-bold">{role} Login</Card.Title>
                      <Form className="mt-3">
                        <Form.Group controlId={`username-${role}`}>
                          <Form.Control
                            type="text"
                            placeholder="Username"
                            className="mb-3 rounded-pill text-center"
                          />
                        </Form.Group>
                        <Form.Group controlId={`password-${role}`}>
                          <Form.Control
                            type="password"
                            placeholder="Password"
                            className="mb-3 rounded-pill text-center"
                          />
                        </Form.Group>
                        <Button
                          variant="success"
                          className="w-100 fw-semibold rounded-pill"
                          onClick={() => handleLogin(role)}
                        >
                          Access Portal
                        </Button>
                      </Form>
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
            cursor: pointer;
          }

          .flip-card-inner {
            position: relative;
            width: 100%;
            height: 100%;
            transition: transform 0.8s ease;
            transform-style: preserve-3d;
          }

          .flip-card.flipped .flip-card-inner {
            transform: rotateY(180deg);
          }

          .flip-card-front,
          .flip-card-back {
            position: absolute;
            width: 100%;
            height: 100%;
            backface-visibility: hidden;
            border-radius: 1rem;
            display: flex;
            flex-direction: column;
            justify-content: center;
            box-shadow: 0 0 15px rgba(0, 255, 0, 0.2);
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

          .glossy-card:hover {
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
        `}</style>
      </div>
    </>
  );
}
