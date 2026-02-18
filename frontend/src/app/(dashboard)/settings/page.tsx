"use client";

import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function SettingsPage() {
  const { user, tenant } = useAuth();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Settings</h1>

      <Card>
        <CardHeader>
          <CardTitle>Organization</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p><strong>Name:</strong> {tenant?.name}</p>
          <p><strong>Slug:</strong> {tenant?.slug}</p>
          <p><strong>Plan:</strong> {tenant?.plan || "free"}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p><strong>Email:</strong> {user?.email}</p>
          <p><strong>Name:</strong> {user?.name || "—"}</p>
          <p><strong>Role:</strong> {user?.role}</p>
        </CardContent>
      </Card>
    </div>
  );
}
