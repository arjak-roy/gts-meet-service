"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuthStore } from "@/stores/authStore";

function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams?.get("redirect");
  const { register } = useAuthStore();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("STUDENT");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      await register(name, email, password, role);
      router.push(redirect || "/dashboard");
    } catch (err: any) {
      setError(err.message || "Registration failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  const roles = [
    { value: "STUDENT", label: "Student", icon: "🎓" },
    { value: "INSTRUCTOR", label: "Instructor", icon: "👨‍🏫" },
  ];

  return (
    <div className="auth-page">
      <div className="auth-bg-glow" />

      <div className="auth-container animate-scaleIn">
        <div className="auth-logo">
          <div className="auth-logo-icon">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
              <rect width="32" height="32" rx="8" fill="url(#logoGrad2)" />
              <path d="M10 12L16 8L22 12V20L16 24L10 20V12Z" stroke="white" strokeWidth="2" fill="none" />
              <circle cx="16" cy="16" r="3" fill="white" />
              <defs>
                <linearGradient id="logoGrad2" x1="0" y1="0" x2="32" y2="32">
                  <stop stopColor="#6366f1" />
                  <stop offset="1" stopColor="#06b6d4" />
                </linearGradient>
              </defs>
            </svg>
          </div>
          <h1 className="auth-title">Create Account</h1>
          <p className="auth-subtitle">Join GTS Meet Online Classroom</p>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="form-group">
            <label htmlFor="name">Full Name</label>
            <input
              id="name"
              type="text"
              className="input"
              placeholder="John Doe"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              minLength={2}
            />
          </div>

          <div className="form-group">
            <label htmlFor="reg-email">Email</label>
            <input
              id="reg-email"
              type="email"
              className="input"
              placeholder="you@school.edu"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="reg-password">Password</label>
            <input
              id="reg-password"
              type="password"
              className="input"
              placeholder="Min 8 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
            />
          </div>

          <div className="form-group">
            <label>I am a</label>
            <div className="role-selector">
              {roles.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  className={`role-option ${role === r.value ? "active" : ""}`}
                  onClick={() => setRole(r.value)}
                >
                  <span className="role-icon">{r.icon}</span>
                  <span>{r.label}</span>
                </button>
              ))}
            </div>
          </div>

          {error && <div className="auth-error">{error}</div>}

          <button type="submit" className="btn-primary auth-submit" disabled={isSubmitting}>
            {isSubmitting ? "Creating account..." : "Create Account"}
          </button>
        </form>

        <div className="auth-footer">
          <p>
            Already have an account?{" "}
            <a href={"/login" + (redirect ? `?redirect=${encodeURIComponent(redirect)}` : "")} className="auth-link">
              Sign in
            </a>
          </p>
        </div>
      </div>

      <style jsx>{`
        .auth-page {
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          background: var(--gradient-dark);
          position: relative;
          overflow: hidden;
        }

        .auth-bg-glow {
          position: absolute;
          top: -30%;
          left: 50%;
          transform: translateX(-50%);
          width: 600px;
          height: 600px;
          background: radial-gradient(circle, rgba(99, 102, 241, 0.12) 0%, transparent 70%);
          pointer-events: none;
        }

        .auth-container {
          position: relative;
          width: 100%;
          max-width: 420px;
          padding: 48px 40px;
          background: var(--color-bg-card);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-xl);
          backdrop-filter: blur(24px);
          box-shadow: var(--shadow-lg);
        }

        .auth-logo {
          text-align: center;
          margin-bottom: 36px;
        }

        .auth-logo-icon {
          display: inline-flex;
          padding: 12px;
          background: rgba(99, 102, 241, 0.1);
          border-radius: var(--radius-lg);
          margin-bottom: 16px;
        }

        .auth-title {
          font-size: 28px;
          font-weight: 800;
          background: var(--gradient-primary);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          margin: 0 0 4px;
        }

        .auth-subtitle {
          font-size: 14px;
          color: var(--color-text-secondary);
          margin: 0;
        }

        .auth-form {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .form-group {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .form-group label {
          font-size: 13px;
          font-weight: 500;
          color: var(--color-text-secondary);
        }

        .role-selector {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
        }

        .role-option {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 12px 16px;
          font-size: 14px;
          font-weight: 500;
          color: var(--color-text-secondary);
          background: var(--color-bg-glass);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-md);
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .role-option:hover {
          border-color: var(--color-border-hover);
        }

        .role-option.active {
          color: var(--color-primary);
          border-color: var(--color-primary);
          background: rgba(99, 102, 241, 0.1);
        }

        .role-icon {
          font-size: 18px;
        }

        .auth-error {
          padding: 10px 14px;
          font-size: 13px;
          color: var(--color-error);
          background: rgba(239, 68, 68, 0.1);
          border: 1px solid rgba(239, 68, 68, 0.2);
          border-radius: var(--radius-sm);
        }

        .auth-submit {
          width: 100%;
          margin-top: 4px;
          padding: 14px;
          font-size: 15px;
        }

        .auth-footer {
          text-align: center;
          margin-top: 24px;
          font-size: 13px;
          color: var(--color-text-muted);
        }

        .auth-link {
          color: var(--color-primary);
          text-decoration: none;
          font-weight: 600;
        }

        .auth-link:hover {
          color: var(--color-primary-hover);
        }
        @media (max-width: 480px) {
          .auth-container {
            padding: 32px 24px;
            border-radius: 0;
            border: none;
            min-height: 100vh;
            display: flex;
            flex-direction: column;
            justify-content: center;
          }
          .role-selector {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: 'var(--color-bg-primary)' }}>Loading...</div>}>
      <RegisterForm />
    </Suspense>
  );
}
