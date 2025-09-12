import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useNavigate } from "react-router-dom";
import { register } from "@/lib/api";
import { toast } from "sonner";

export default function RegisterPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      setError(null);
      await register(username, password);
      toast.success("Account created! You can now log in.");
      navigate("/login");
    } catch (e: any) {
      setError(e?.message || "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gallery-bg">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Create Creator Account</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={onSubmit}>
            <div>
              <Label>Username</Label>
              <Input value={username} onChange={(e) => setUsername(e.target.value)} required />
            </div>
            <div>
              <Label>Password</Label>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            {error && <div className="text-sm text-red-600">{error}</div>}
            <Button type="submit" disabled={loading} className="w-full">{loading ? "Creating..." : "Sign Up"}</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}