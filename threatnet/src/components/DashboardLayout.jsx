import React from "react";
import { Navbar, Nav, Container, Badge, Dropdown } from "react-bootstrap";
import { useAuth } from "../auth/AuthContext";
import { Link, useNavigate } from "react-router-dom";

export default function DashboardLayout({ title, children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate("/", { replace: true });
  };

  return (
    <div className="d-flex" style={{ minHeight: "100vh" }}>
      {/* Sidebar */}
      <div
        className="bg-dark text-white p-3"
        style={{ width: 260, flexShrink: 0, display: "flex", flexDirection: "column" }}
      >
        <h4 className="mb-4">Defense Portal</h4>
        <div className="mb-3">
          <div>
            <strong>{user?.username}</strong>
          </div>
          <div>
            <Badge bg="info" className="text-uppercase">
              {user?.role}
            </Badge>
          </div>
        </div>
        <Nav className="flex-column">
          <Nav.Link as={Link} to={`/${user?.role.toLowerCase()}`} className="text-white">
            Dashboard
          </Nav.Link>
          {["user", "commander", "admin"].includes(user?.role.toLowerCase()) && (
            <Nav.Link as={Link} to="/reports" className="text-white">
              Reports
            </Nav.Link>
          )}
          {user?.role === "admin" && (
            <>
              <Nav.Link as={Link} to="/admin/users" className="text-white">
                User Management
              </Nav.Link>
              <Nav.Link as={Link} to="/admin/audit" className="text-white">
                Audit Logs
              </Nav.Link>
            </>
          )}
        </Nav>
        <div className="mt-auto">
          <button className="btn btn-sm btn-outline-light w-100" onClick={handleLogout}>
            Logout
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-grow-1 bg-light">
        <Navbar bg="white" expand="lg" className="shadow-sm">
          <Container fluid>
            <Navbar.Brand>{title}</Navbar.Brand>
            <Nav className="ms-auto">
              <Dropdown align="end">
                <Dropdown.Toggle variant="secondary" size="sm">
                  {user?.username}
                </Dropdown.Toggle>
                <Dropdown.Menu>
                  <Dropdown.Item onClick={handleLogout}>Logout</Dropdown.Item>
                </Dropdown.Menu>
              </Dropdown>
            </Nav>
          </Container>
        </Navbar>
        <Container fluid className="p-4">{children}</Container>
      </div>
    </div>
  );
}
