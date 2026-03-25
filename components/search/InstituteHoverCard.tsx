"use client";

import React, { useState, useEffect } from "react";
import { GraduationCap, Calendar, BookOpen, ExternalLink } from "lucide-react";
import { motion } from "framer-motion";

const LOGO_DEV_KEY = process.env.NEXT_PUBLIC_LOGO_DEV_TOKEN ?? "pk_JgbzA-I-Ssu_JN0iUMq1rQ";

const LOGO_SEARCH_CACHE: Record<string, string | null> = {};
const IN_FLIGHT = new Set<string>();

function InstituteLogo({ logoUrl, name }: { logoUrl?: string | null; name: string }) {
  const [failed, setFailed] = useState(false);
  const [fallbackDomain, setFallbackDomain] = useState<string | null>(
    LOGO_SEARCH_CACHE[name] ?? null
  );
  const [loading, setLoading] = useState(false);

  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

  useEffect(() => {
    if ((!logoUrl || failed) && name && !fallbackDomain && !loading && !IN_FLIGHT.has(name)) {
      setLoading(true);
      IN_FLIGHT.add(name);
      fetch(`/api/logo/search?name=${encodeURIComponent(name)}`)
        .then((r) => r.json())
        .then((d) => {
          if (d.domain) {
            LOGO_SEARCH_CACHE[name] = d.domain;
            setFallbackDomain(d.domain);
          }
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    }
  }, [logoUrl, failed, name, fallbackDomain, loading]);

  const src = logoUrl && !failed
    ? logoUrl
    : fallbackDomain
    ? `https://img.logo.dev/${fallbackDomain}?token=${LOGO_DEV_KEY}&size=64`
    : null;

  if (src) {
    return (
      <img
        src={src}
        alt={name}
        width={40}
        height={40}
        className="rounded-lg object-contain bg-white border border-gray-100"
        style={{ width: 40, height: 40 }}
        onError={() => {
          if (logoUrl && !failed) setFailed(true);
          else setFallbackDomain(null);
        }}
      />
    );
  }

  return (
    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-violet-50 to-violet-100 border border-violet-200 flex items-center justify-center flex-shrink-0">
      <span className="text-xs font-bold text-violet-600">{initials || "?"}</span>
    </div>
  );
}

export interface InstituteHoverCardProps {
  instituteName: string;
  logoUrl?: string | null;
  degree?: string | null;
  fieldOfStudy?: string | null;
  startYear?: number | null;
  endYear?: number | null;
  activities?: string | null;
  grade?: string | null;
}

export function InstituteHoverCard({
  instituteName,
  logoUrl,
  degree,
  fieldOfStudy,
  startYear,
  endYear,
  activities,
  grade,
}: InstituteHoverCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 6, scale: 0.96 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
      className="w-72 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-[0_16px_40px_rgba(0,0,0,0.14),0_4px_12px_rgba(109,40,217,0.06)]"
    >
      {/* Header gradient bar — violet for education */}
      <div className="h-1.5 w-full bg-gradient-to-r from-violet-500 to-purple-400" />

      {/* Institute identity */}
      <div className="flex items-start gap-3 px-4 pt-3.5 pb-3 border-b border-gray-100">
        <InstituteLogo logoUrl={logoUrl} name={instituteName} />
        <div className="min-w-0 flex-1">
          <h4 className="text-[13px] font-bold text-gray-900 leading-tight">{instituteName}</h4>
          {degree && (
            <p className="text-[11px] text-violet-600 font-medium mt-0.5 truncate">{degree}</p>
          )}
          {fieldOfStudy && (
            <p className="text-[10px] text-gray-500 mt-0.5 truncate">{fieldOfStudy}</p>
          )}
        </div>
      </div>

      {/* Details */}
      <div className="px-4 py-3 space-y-2">
        {(startYear || endYear) && (
          <div>
            <span className="flex items-center gap-1 text-[9px] uppercase font-bold tracking-wider text-gray-400 mb-0.5">
              <Calendar className="h-2.5 w-2.5" />
              Period
            </span>
            <span className="text-[12px] font-semibold text-gray-800">
              {startYear ?? "?"} – {endYear ?? "Present"}
            </span>
          </div>
        )}

        {grade && (
          <div>
            <span className="flex items-center gap-1 text-[9px] uppercase font-bold tracking-wider text-gray-400 mb-0.5">
              <BookOpen className="h-2.5 w-2.5" />
              Grade / GPA
            </span>
            <span className="text-[12px] font-semibold text-gray-800">{grade}</span>
          </div>
        )}
      </div>

      {activities && (
        <p className="px-4 pb-3.5 text-[10px] text-gray-500 line-clamp-2 leading-relaxed border-t border-gray-50 pt-2 italic">
          {activities}
        </p>
      )}
    </motion.div>
  );
}
