import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Container,
  Card,
  Button,
  Form,
  Alert,
  ProgressBar,
  Spinner
} from "react-bootstrap";
import { useAuth } from "../auth/AuthContext";
import "../assets/Register.css"; 

// Role definitions with visuals
const roleDetails = {
  user: {
    title: "Join the Community",
    desc: "Be part of a growing network of like-minded people.",
    color: "success",
    icon: "👤",
    progressStyle: "striped",
  },
  commander: {
    title: "Step Into Leadership",
    desc: "Guide and lead your squad to success.",
    color: "warning",
    icon: "🛡️",
    progressStyle: "animated",
  },
  admin: {
    title: "Unlock the Control Room",
    desc: "Oversee and manage the entire system.",
    color: "danger",
    icon: "🔑",
    progressStyle: "animated",
  },
};

const availableInviteCodes = ["hack"];

export default function Register() {
  const navigate = useNavigate();
  const { register: authRegister, loading, error: regError } = useAuth();

  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    role: "",
    username: "",
    password: "",
    inviteCode: "",
  });
  const [localErr, setLocalErr] = useState("");
  const [inviteStatus, setInviteStatus] = useState(null); // null, "valid", "invalid"

  const isElite = (role) => ["commander", "admin"].includes(role);

  const handleNext = () => {
    if (step === 1) {
      if (!form.role) return setLocalErr("Please select a role to continue");
    }
    if (step === 2) {
      if (!form.username || form.username.length < 3)
        return setLocalErr("Username must be at least 3 characters");
      if (!form.password || form.password.length < 6)
        return setLocalErr("Password must be at least 6 characters");
    }
    if (step === 3 && isElite(form.role)) {
      if (!form.inviteCode)
        return setLocalErr("Invite code is required for this role");
      if (!availableInviteCodes.includes(form.inviteCode.toLowerCase())) {
        setInviteStatus("invalid");
        return setLocalErr("Invalid invite code");
      }
      setInviteStatus("valid");
    }
    setLocalErr("");
    setStep((s) => s + 1);
  };

  const handleSubmit = async () => {
    try {
      await authRegister(form);
      navigate(`/${form.role}`);
    } catch (e) {
      console.error(e);
      setLocalErr(e.response?.data?.error || regError || "Registration failed");
    }
  };

  const RoleSelect = () => (
    <div className="d-flex gap-3 justify-content-center flex-wrap">
      {Object.keys(roleDetails).map((role) => {
        const r = roleDetails[role];
        const active = form.role === role;
        return (
          <Card
            key={role}
            border={active ? r.color : "light"}
            bg={active ? r.color : "light"}
            text={active ? "white" : "dark"}
            className={`role-card ${active ? "selected" : ""}`}
            style={{ cursor: "pointer", minWidth: 180 }}
            onClick={() => setForm((f) => ({ ...f, role }))}
          >
            <Card.Body className="text-center">
              <div style={{ fontSize: "2rem" }}>{r.icon}</div>
              <Card.Title>{role.charAt(0).toUpperCase() + role.slice(1)}</Card.Title>
              <Card.Text>{r.desc}</Card.Text>
            </Card.Body>
          </Card>
        );
      })}
    </div>
  );

  return (
    <div className="login-bg text-white py-5">
      <Container style={{ maxWidth: 500 }}>
        <Card className="p-4 shadow-lg">
          <Card.Body>
            <h3
              className={`text-center mb-3 fw-bold text-${form.role ? roleDetails[form.role].color : "primary"}`}
            >
              {form.role ? roleDetails[form.role].title : "Sign Up"}
            </h3>
            <ProgressBar
              now={(step - 1) * 33}
              variant={form.role ? roleDetails[form.role].color : "primary"}
              className="mb-4"
              label={`${step}/4`}
              animated={form.role && roleDetails[form.role].progressStyle === "animated"}
              striped={form.role && roleDetails[form.role].progressStyle === "striped"}
            />
            {localErr && <Alert variant="danger">{localErr}</Alert>}

            {step === 1 && <RoleSelect />}

            {step === 2 && (
              <>
                <Form.Group className="mb-3">
                  <Form.Control
                    type="text"
                    placeholder="Username"
                    value={form.username}
                    onChange={(e) => setForm({ ...form, username: e.target.value })}
                  />
                </Form.Group>
                <Form.Group className="mb-3">
                  <Form.Control
                    type="password"
                    placeholder="Password"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                  />
                </Form.Group>
              </>
            )}

            {step === 3 && isElite(form.role) && (
              <Form.Group className={`mb-3 invite-box ${inviteStatus}`}>
                <Form.Control
                  type="text"
                  placeholder="Invite Code"
                  value={form.inviteCode}
                  onChange={(e) => {
                    setForm({ ...form, inviteCode: e.target.value });
                    setInviteStatus(null);
                  }}
                />
                <Form.Text className="text-muted">
                  Officer-level access only.
                </Form.Text>
              </Form.Group>
            )}

            {step === 4 && (
              <div className="mb-3">
                <strong>Role:</strong> {form.role} <br />
                <strong>Username:</strong> {form.username} <br />
                {isElite(form.role) && (
                  <>
                    <strong>Invite Code:</strong> {form.inviteCode} <br />
                  </>
                )}
              </div>
            )}

            {/* Navigation Buttons */}
            <div className="d-flex justify-content-between mt-4">
              {step > 1 ? (
                <Button
                  variant="outline-secondary"
                  onClick={() => setStep((s) => s - 1)}
                >
                  ← Back
                </Button>
              ) : (
                <div />
              )}
              {step < 4 ? (
                <Button variant="success" onClick={handleNext}>
                  Next →
                </Button>
              ) : (
                <Button
                  variant="primary"
                  onClick={handleSubmit}
                  disabled={loading}
                >
                  {loading ? <Spinner size="sm" /> : "Register Now"}
                </Button>
              )}
            </div>

            {/* Login Redirect */}
            <div className="mt-3 text-center">
              <small>
                Already have an account?{" "}
                <Button variant="link" onClick={() => navigate("/")}>
                  Login
                </Button>
              </small>
            </div>

            {regError && (
              <div className="mt-2 text-danger small">{regError}</div>
            )}
          </Card.Body>
        </Card>
      </Container>
    </div>
  );
}
