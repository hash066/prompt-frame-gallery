import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Sparkles, Eye, EyeOff, Mail, Lock, Shield } from "lucide-react";
import { toast } from "sonner";
import { login, seedAdmin } from "@/lib/api";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isAdminMode, setIsAdminMode] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      if (isAdminMode) {
        // Seed admin and validate static creds: nexel / nexel
        await seedAdmin();
        if (username === "nexel" && password === "nexel") {
          toast.success("Admin login successful");
          navigate("/admin");
          return;
        }
        toast.error("Invalid admin credentials");
        return;
      }
      const result = await login(username, password);
      // Persist simple session: store username for upload ownership
      localStorage.setItem('username', username);
      toast.success("Welcome back!");
      if (result.role === "admin") navigate("/admin");
      else navigate("/");
    } catch (error) {
      toast.error("Login failed. Please check your credentials.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gallery-bg">
      <div className="absolute inset-0 bg-gradient-bg opacity-50" />

      <Card className="w-full max-w-md relative z-10 bg-card/80 backdrop-blur-lg border-primary/20 glow-primary">
        <CardHeader className="text-center space-y-4">
          <div className="mx-auto w-16 h-16 bg-gradient-primary rounded-2xl flex items-center justify-center glow-primary">
            {isAdminMode ? <Shield className="w-8 h-8 text-primary-foreground" /> : <Sparkles className="w-8 h-8 text-primary-foreground" />}
          </div>
          <div>
            <CardTitle className="text-2xl font-bold gradient-text">
              {isAdminMode ? "Admin Login" : "Welcome "}
            </CardTitle>
            <CardDescription className="text-muted-foreground">
              {isAdminMode ? "Sign in as Admin with our team name as username and password" : "Sign in to your Creator account"}
            </CardDescription>
          </div>
        </CardHeader>

        <form onSubmit={handleLogin}>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="username" className="text-sm font-medium">
                {isAdminMode ? "Team Name" : "Username"}
              </Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input
                  id="username"
                  type="text"
                  placeholder={isAdminMode ? "Your team name" : "your-username"}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="pl-10 bg-input/50 border-border/50 focus:border-primary transition-smooth"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-medium">
                Password
              </Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder={isAdminMode ? "Team secret" : "Your password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10 pr-10 bg-input/50 border-border/50 focus:border-primary transition-smooth"
                  required
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-2 top-1/2 transform -translate-y-1/2 h-6 w-6 p-0 hover:bg-transparent"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4 text-muted-foreground" />
                  ) : (
                    <Eye className="w-4 h-4 text-muted-foreground" />
                  )}
                </Button>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <Button type="button" variant="outline" size="sm" onClick={() => setIsAdminMode((s) => !s)}>
                {isAdminMode ? "Switch to Creator" : "Switch to Admin"}
              </Button>
              {!isAdminMode && (
                <Link to="/register" className="text-sm text-primary hover:text-primary-glow transition-smooth">
                  Create an account
                </Link>
              )}
            </div>
          </CardContent>

          <CardFooter className="flex flex-col space-y-4">
            <Button
              type="submit"
              disabled={isLoading}
              className="w-full bg-gradient-primary hover:bg-gradient-secondary transition-smooth glow-primary"
            >
              {isLoading ? "Signing in..." : "Sign In"}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}