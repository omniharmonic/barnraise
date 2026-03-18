"use client";

import { Suspense, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";

export default function SignInPage() {
  return (
    <Suspense>
      <SignInForm />
    </Suspense>
  );
}

function SignInForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/dashboard";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const result = await signIn("credentials", {
      email,
      password,
      name: isSignUp ? name : "",
      isSignUp: isSignUp ? "true" : "false",
      redirect: false,
    });

    if (result?.error) {
      // NextAuth wraps authorize() errors in a generic message,
      // but the error string comes through in result.error
      const msg = result.error === "CredentialsSignin"
        ? isSignUp
          ? "An account with this email may already exist. Try signing in."
          : "Invalid email or password."
        : result.error;
      setError(msg);
      setLoading(false);
    } else {
      router.push(callbackUrl);
    }
  };

  return (
    <div className="flex min-h-[80vh] items-center justify-center">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <Image
              src="/barn_raise_no_bg.png"
              alt="Barn Raise"
              width={80}
              height={80}
              className="object-contain"
            />
          </div>
          <CardTitle className="text-2xl font-display">
            {isSignUp ? "Join Barn Raise" : "Welcome Back"}
          </CardTitle>
          <CardDescription>
            {isSignUp
              ? "Create an account to start coordinating collective work"
              : "Sign in to your account"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {isSignUp && (
              <div>
                <label className="block text-sm font-medium text-walnut mb-1.5">
                  Display Name
                </label>
                <Input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  required={isSignUp}
                />
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-walnut mb-1.5">
                Email
              </label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-walnut mb-1.5">
                Password
              </label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={isSignUp ? "Create a password" : "Your password"}
                required
                minLength={6}
              />
            </div>
            {error && (
              <div className="p-3 bg-red-50 rounded-xl border border-red-200 text-sm text-red-700">
                {error}
              </div>
            )}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "..." : isSignUp ? "Create Account" : "Sign In"}
            </Button>
          </form>
          <div className="mt-4 text-center">
            <button
              type="button"
              className="text-sm text-barn hover:underline cursor-pointer"
              onClick={() => {
                setIsSignUp(!isSignUp);
                setError("");
              }}
            >
              {isSignUp ? "Already have an account? Sign in" : "New here? Create an account"}
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
