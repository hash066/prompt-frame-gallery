import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { listUsers, deleteUser, seedAdmin } from "@/lib/api";

export default function Admin() {
  const [adminUser, setAdminUser] = useState("nexel");
  const [adminPass, setAdminPass] = useState("nexel");
  const [users, setUsers] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Ensure admin exists
    seedAdmin().catch(() => {});
  }, []);

  const loadUsers = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await listUsers(adminUser, adminPass);
      setUsers(data);
    } catch (e: any) {
      setError(e?.message || "Failed to load users");
      setUsers([]);
    } finally {
      setLoading(false);
    }
  };

  const onDelete = async (username: string) => {
    await deleteUser(username, adminUser, adminPass);
    await loadUsers();
  };

  return (
    <div className="p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Admin Login</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label>Username</Label>
              <Input value={adminUser} onChange={(e) => setAdminUser(e.target.value)} />
            </div>
            <div>
              <Label>Password</Label>
              <Input type="password" value={adminPass} onChange={(e) => setAdminPass(e.target.value)} />
            </div>
            <div className="flex items-end">
              <Button onClick={loadUsers} disabled={loading} className="w-full">{loading ? "Loading..." : "Load Users"}</Button>
            </div>
            {error && <div className="text-red-600 text-sm md:col-span-3">{error}</div>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>All Accounts</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left border-b">
                    <th className="py-2 pr-4">Username</th>
                    <th className="py-2 pr-4">Role</th>
                    <th className="py-2 pr-4">Created</th>
                    <th className="py-2 pr-4">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} className="border-b">
                      <td className="py-2 pr-4">{u.username}</td>
                      <td className="py-2 pr-4">{u.role}</td>
                      <td className="py-2 pr-4">{u.created_at || u.created_at_datetime || "-"}</td>
                      <td className="py-2 pr-4">
                        <Button variant="destructive" size="sm" onClick={() => onDelete(u.username)}>Delete</Button>
                      </td>
                    </tr>
                  ))}
                  {users.length === 0 && (
                    <tr>
                      <td className="py-4 text-muted-foreground" colSpan={4}>No users loaded.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}


