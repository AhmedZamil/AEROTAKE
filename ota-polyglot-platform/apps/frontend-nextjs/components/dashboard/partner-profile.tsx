"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  defaultPartnerAccount,
  defaultPartnerProfile,
  type PartnerAccount,
  type PartnerProfile,
} from "@/data/profile";
import type { TenantContext } from "@/lib/tenants";

/** The verified, server-checked identity app/dashboard/layout.tsx passes down. */
export interface PartnerIdentity {
  sub: string;
  tenantId: string;
  agentId: string | null;
  role: string;
}

interface IdentityResponse {
  displayName: string | null;
  tier: string | null;
  creditLimit: number | null;
  creditUsed: number | null;
  available: number | null;
}

/** Real credit data from the same identity fetch below — used by the
 * dashboard-home credit-balance card and low-credit alert. Null until the
 * fetch resolves, or permanently null when there's no agent to look up. */
export interface PartnerCredit {
  tier: string | null;
  creditLimit: number | null;
  creditUsed: number | null;
  available: number | null;
}

type PartnerProfileContextValue = {
  profile: PartnerProfile;
  account: PartnerAccount;
  identity: PartnerIdentity;
  credit: PartnerCredit | null;
  /** True from mount until the real agency-data fetch settles (only ever
   * true when there's an agentId to look up — see partner-profile.tsx). */
  identityLoading: boolean;
  updateProfile: (next: PartnerProfile) => void;
  updateAccount: (next: PartnerAccount) => void;
};

const PartnerProfileContext = createContext<PartnerProfileContextValue | null>(null);

export function PartnerProfileProvider({
  children,
  identity,
  branding,
}: {
  children: React.ReactNode;
  identity: PartnerIdentity;
  branding: TenantContext["branding"];
}) {
  // No agent (e.g. a platform Admin) has no agency to look up at all — fall
  // back to the real tenant brand name immediately, synchronously, rather
  // than ever showing the fabricated "AeroTake Aviation" placeholder or a
  // loading flash for a fetch that would never resolve to anything real.
  const [profile, setProfile] = useState<PartnerProfile>(() =>
    identity.agentId
      ? defaultPartnerProfile
      : { ...defaultPartnerProfile, agencyName: branding.name, agencyId: identity.role },
  );
  const [account, setAccount] = useState(defaultPartnerAccount);
  const [credit, setCredit] = useState<PartnerCredit | null>(null);
  const [identityLoading, setIdentityLoading] = useState(Boolean(identity.agentId));

  useEffect(() => {
    if (!identity.agentId) {
      setIdentityLoading(false);
      return;
    }

    let cancelled = false;
    setIdentityLoading(true);
    fetch("/api/dashboard/identity", { cache: "no-store" })
      .then((res) => res.json())
      .then((data: IdentityResponse) => {
        if (cancelled) return;
        if (data.displayName) {
          // Only the two fields with a real source get replaced — everything
          // else (address, trade license, etc.) has no backend equivalent
          // and stays exactly as the placeholder default.
          setProfile((prev) => ({ ...prev, agencyName: data.displayName!, agencyId: identity.agentId! }));
        }
        setCredit({
          tier: data.tier,
          creditLimit: data.creditLimit,
          creditUsed: data.creditUsed,
          available: data.available,
        });
      })
      .catch(() => {
        // Leave the placeholder in place — this isn't the money-moving path.
      })
      .finally(() => {
        if (!cancelled) setIdentityLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [identity.agentId]);

  const value = useMemo(
    () => ({
      profile,
      account,
      identity,
      credit,
      identityLoading,
      updateProfile: (next: PartnerProfile) => setProfile(next),
      updateAccount: (next: PartnerAccount) => setAccount(next),
    }),
    [profile, account, identity, credit, identityLoading],
  );

  return (
    <PartnerProfileContext.Provider value={value}>{children}</PartnerProfileContext.Provider>
  );
}

export function usePartnerProfile() {
  const context = useContext(PartnerProfileContext);
  if (!context) {
    throw new Error("usePartnerProfile must be used within PartnerProfileProvider");
  }
  return context;
}
