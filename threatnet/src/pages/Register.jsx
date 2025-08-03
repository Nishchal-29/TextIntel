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

const stepConfigs = {
  1: { title: "Choose a role", label: "Role" },
  2: { title: "New Account Info", label: "Account Details" },
  3: { title: "Vet for Elite Roles", label: "Verification" },
  4: { title: "Confirm & Proceed", label: "Review & Submit" },
};

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

  const handleNext = async () => {
    if (step === 1) {
      if (!form.role) return setLocalErr("Please select a role");
      if (form.role !== "user" && form.role !== "commander" && form.role !== "admin")
        return setLocalErr("Invalid role");
    }
    if (step === 2) {
      if (!form.username || form.username.length < 3)
        return setLocalErr("Username is required (≥ 3 chars)");
      if (!form.password || form.password.length < 6)
        return setLocalErr("Password must be ≥ 6 chars");
    }
    if (step === 3 && (form.role === "commander" || form.role === "admin")) {
      if (!form.inviteCode)
        return setLocalErr("Invite code required for that role");
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

  const availableInviteCodes = ["RED-CVT-123", "ADM-ROVER", "CMDR-EXCEL"]; // demo
  const isElite = (role) => ["commander", "admin"].includes(role);

  return (
    <div className="login-bg text-white py-5">
      <Container style={{ maxWidth: 480 }}>
        <Card className="p-4">
          <Card.Body>
            <h3 className="text-center mb-3 text-success fw-bold">
              Sign Up — {stepConfigs[step].title}
            </h3>
            <ProgressBar
              now={(step - 1) * 33}
              variant="success"
              className="mb-4"
              label={`${step}/4`}
            />
            {localErr && <Alert variant="danger">{localErr}</Alert>}

            {step === 1 && (
              <Form.Group className="mb-4">
                <Form.Label>Select Role</Form.Label>
                <Form.Select
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value })}
                >
                  <option value="">-- Choose role --</option>
                  <option value="user">User</option>
                  <option value="commander">Commander</option>
                  <option value="admin">Admin</option>
                </Form.Select>
              </Form.Group>
            )}

            {[2, 3].includes(step) && (
              <>
                {step === 2 && (
                  <>
                    <Form.Group className="mb-3">
                      <Form.Control
                        type="text"
                        placeholder="Username"
                        value={form.username}
                        onChange={(e) =>
                          setForm({ ...form, username: e.target.value })
                        }
                      />
                    </Form.Group>
                    <Form.Group className="mb-3">
                      <Form.Control
                        type="password"
                        placeholder="Password"
                        value={form.password}
                        onChange={(e) =>
                          setForm({ ...form, password: e.target.value })
                        }
                      />
                    </Form.Group>
                  </>
                )}
                {step === 3 && isElite(form.role) && (
                  <Form.Group className="mb-3">
                    <Form.Control
                      type="text"
                      placeholder="Invite Code (e.g. RED-CVT-123)"
                      value={form.inviteCode}
                      onChange={(e) =>
                        setForm({ ...form, inviteCode: e.target.value })
                      }
                      list="invite-codes"
                    />
                    <datalist id="invite-codes">
                      {availableInviteCodes.map((ic) => (
                        <option key={ic} value={ic} />
                      ))}
                    </datalist>
                    <Form.Text className="text-muted">
                      Found via officer-level invite only
                    </Form.Text>
                  </Form.Group>
                )}
              </>
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
