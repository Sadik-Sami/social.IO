"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import OnboardingForm from "@/components/onboarding-form";
import { useProfile } from "@/hooks/use-profile";

export default function OnboardingPage() {
  const router = useRouter();
  const { data, isLoading } = useProfile();

  useEffect(() => {
    if (!isLoading && data?.exists) {
      router.push("/chat");
    }
  }, [isLoading, data, router]);

  if (isLoading || data?.exists) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-background p-4 sm:p-8">
      <OnboardingForm />
    </div>
  );
}
