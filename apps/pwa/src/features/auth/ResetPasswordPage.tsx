import * as React from "react";
import { Link, useSearchParams } from "react-router-dom";
import { authApi } from "@/api/auth";
import { getApiError } from "@/api/client";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dumbbell, ArrowLeft, CheckCircle } from "lucide-react";

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");
  const [done, setDone] = React.useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      await authApi.resetPassword(token, password);
      setDone(true);
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center space-y-4">
            <p className="text-sm text-muted-foreground">
              This reset link is invalid or has expired.
            </p>
            <Link to="/forgot-password">
              <Button variant="outline" className="w-full">
                Request a new link
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary">
            {done ? (
              <CheckCircle className="h-6 w-6 text-primary-foreground" />
            ) : (
              <Dumbbell className="h-6 w-6 text-primary-foreground" />
            )}
          </div>
          <CardTitle className="text-2xl">
            {done ? "Password reset!" : "Set a new password"}
          </CardTitle>
          <CardDescription>
            {done
              ? "Your password has been updated successfully."
              : "Choose a strong password for your account"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {done ? (
            <Link to="/login">
              <Button className="w-full">Sign in</Button>
            </Link>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">New password</Label>
                <PasswordInput
                  id="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  minLength={8}
                  autoFocus
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirm">Confirm password</Label>
                <PasswordInput
                  id="confirm"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="••••••••"
                  required
                  minLength={8}
                />
              </div>

              {error && (
                <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive-foreground">
                  {error}
                </div>
              )}

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Updating..." : "Reset password"}
              </Button>
            </form>
          )}

          {!done && (
            <div className="mt-4 text-center">
              <Link
                to="/login"
                className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <ArrowLeft className="h-3 w-3" />
                Back to sign in
              </Link>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
