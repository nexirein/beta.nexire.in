"use client";

import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Building2, Users, MapPin, Globe, Briefcase, ExternalLink } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const LOGO_DEV_KEY = process.env.NEXT_PUBLIC_LOGO_DEV_TOKEN ?? "pk_JgbzA-I-Ssu_JN0iUMq1rQ";

function CompanyLogo({ domain, name }: { domain?: string | null; name: string }) {
  const [failed, setFailed] = useState(false);
  const clean = domain?.replace(/^https?:\/\//, "").replace(/\/.*$/, "").trim();
  const initials = name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");

  if (clean && !failed) {
    return (
      <img
        src={`https://img.logo.dev/${clean}?token=${LOGO_DEV_KEY}&size=64`}
        alt={name} width={40} height={40}
        className="rounded-lg object-contain bg-white border border-gray-100 flex-shrink-0"
        style={{ width: 40, height: 40 }}
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-indigo-50 to-indigo-100 border border-indigo-200 flex items-center justify-center flex-shrink-0">
      <span className="text-xs font-bold text-indigo-600">{initials || "?"}</span>
    </div>
  );
}

// Inline LinkedIn SVG specifically for company card footer
function LinkedInSVGMini() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5 flex-shrink-0">
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
    </svg>
  );
}

interface CompanyHoverCardProps {
  companyName: string;
  domain?: string | null;
  industry?: string;
  headcount?: string | number;
  location?: string;
  description?: string;
  website?: string;
  linkedinUrl?: string;
  companyType?: string;
  seniority?: string;
  anchorRect?: DOMRect | null; // Used to render exact location
}

export function CompanyHoverCard({
  companyName, domain, industry, headcount, location, description, website, linkedinUrl, companyType, seniority, anchorRect
}: CompanyHoverCardProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  if (!mounted || typeof window === "undefined" || !anchorRect) return null;

  // Position card to the RIGHT of the anchor so it never overlaps profile names.
  // Falls back to the left side if not enough room on the right.
  const cardWidth = 300;
  const gap = 10;

  const windowWidth = window.innerWidth;
  const windowHeight = window.innerHeight;

  // Try right side first
  let left = anchorRect.right + gap;
  let bridgeLeft = false;
  if (left + cardWidth > windowWidth - 8) {
    left = anchorRect.left - cardWidth - gap;
    bridgeLeft = true;
  }
  if (left < 8) left = 8;

  // Vertical: top-align with middle of the anchor, clamp to viewport
  let top = Math.max(8, anchorRect.top - 20);
  if (top + 290 > windowHeight - 8) top = Math.max(8, windowHeight - 290 - 8);

  const finalLinkedinUrl = linkedinUrl || `https://www.linkedin.com/search/results/companies/?keywords=${encodeURIComponent(companyName)}`;

  const content = (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.15, ease: "easeOut" }}
      style={{
        position: "fixed",
        top,
        left,
        zIndex: 99999,
        width: cardWidth,
      }}
      className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-[0_16px_40px_rgba(0,0,0,0.12),0_4px_12px_rgba(79,70,229,0.06)]"
      onMouseEnter={(e) => e.stopPropagation()}
    >
      {/* Invisible bridge back to the trigger so mouse doesn't get lost in gap */}
      <div 
        className="absolute top-0 bg-transparent"
        style={{
          width: gap,
          top: 0,
          bottom: 0,
          ...(bridgeLeft ? { right: -gap } : { left: -gap }),
        }}
      />

      <div className="h-1.5 w-full bg-gradient-to-r from-indigo-500 to-indigo-400" />

      <div className="flex items-start gap-3 px-4 pt-3.5 pb-3 border-b border-gray-100 bg-white">
        <a 
          href={finalLinkedinUrl} 
          target="_blank" rel="noopener noreferrer" 
          onClick={(e) => e.stopPropagation()}
          className="block flex-shrink-0 transition-transform duration-200 hover:scale-110 hover:shadow-md rounded-lg"
          title={`View ${companyName} on professional network`}
        >
          <CompanyLogo domain={domain} name={companyName} />
        </a>
        <div className="min-w-0 flex-1 mt-0.5">
          <h4 className="text-[14px] font-bold text-gray-900 leading-tight truncate">{companyName}</h4>
          {industry && <p className="text-[11.5px] text-gray-500 mt-0.5 truncate">{industry}</p>}
          {companyType && (
            <span className="inline-block mt-1.5 text-[10px] px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-100 font-semibold uppercase tracking-wide">
              {companyType}
            </span>
          )}
        </div>
      </div>

      <div className="px-4 py-3 grid grid-cols-2 gap-x-4 gap-y-3 bg-white">
        <div>
          <span className="flex items-center gap-1.5 text-[9.5px] uppercase font-bold tracking-[0.06em] text-gray-400 mb-0.5">
            <Users className="h-3 w-3" /> Employees
          </span>
          <span className="text-[12.5px] font-semibold text-gray-800">{headcount || "—"}</span>
        </div>
        <div>
          <span className="flex items-center gap-1.5 text-[9.5px] uppercase font-bold tracking-[0.06em] text-gray-400 mb-0.5">
            <MapPin className="h-3 w-3" /> HQ
          </span>
          <span className="text-[12.5px] font-semibold text-gray-800 truncate block" title={location}>{location || "—"}</span>
        </div>
        {seniority && (
          <div className="col-span-2">
             <span className="flex items-center gap-1.5 text-[9.5px] uppercase font-bold tracking-[0.06em] text-gray-400 mb-0.5">
              <Briefcase className="h-3 w-3" /> Level
            </span>
            <span className="text-[12.5px] font-semibold text-gray-800">{seniority}</span>
          </div>
        )}
      </div>

      {description && (
        <p className="px-4 pb-3.5 text-[11px] text-gray-500 line-clamp-2 leading-relaxed border-t border-gray-50 pt-3 bg-white">
          {description}
        </p>
      )}

      <div className="flex items-center gap-4 px-4 py-3 border-t border-gray-100 bg-gray-50">
        {website && (
          <a
            href={website.startsWith("http") ? website : `https://${website}`}
            target="_blank" rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="flex items-center gap-1.5 text-[11.5px] font-bold text-indigo-600 hover:text-indigo-800 hover:underline transition-colors"
          >
            <Globe className="h-3.5 w-3.5" /> Visit website
          </a>
        )}
        <a
          href={finalLinkedinUrl}
          target="_blank" rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="flex items-center gap-1.5 text-[11.5px] font-bold text-[#0A66C2] hover:text-[#004182] hover:underline transition-colors"
        >
          <LinkedInSVGMini /> Profile
        </a>
      </div>
    </motion.div>
  );

  return createPortal(content, document.body);
}
