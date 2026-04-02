import * as React from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuthStore } from "@/stores/auth";
import { getApiError } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dumbbell } from "lucide-react";

export default function LoginPage() {
  const navigate = useNavigate();
  const { login, isAuthenticated } = useAuthStore();

  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (isAuthenticated) navigate("/dashboard", { replace: true });
  }, [isAuthenticated, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
        await login(email, password);
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary">
            <Dumbbell className="h-6 w-6 text-primary-foreground" />
          </div>
          <CardTitle className="text-2xl">
           Welcome back
          </CardTitle>
          <CardDescription>
           
            Sign in to your gym management accountCreate the first super admin account
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={ 8 }
              />
            </div>

            {error && (
              <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive-foreground">
                {error}
              </div>
            )}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Please wait..." :  "Sign In" }
            </Button>

              <div className="text-right">
                <Link
                  to="/forgot-password"
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  Forgot password?
                </Link>
              </div>
          </form>

          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={() => {
                setError("");
              }}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              
                Already have an account? Sign in
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
