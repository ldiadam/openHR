import React from 'react';

interface IsoIconProps {
  size?: number;
}

/** 3D Isometric Orange Stopwatch (Kehadiran / Attendance) */
export const IsoAttendanceIcon: React.FC<IsoIconProps> = ({ size = 44 }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
    <defs>
      <linearGradient id="iso_att_body" x1="16" y1="14" x2="48" y2="54" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#FFB347" />
        <stop offset="55%" stopColor="#F97316" />
        <stop offset="100%" stopColor="#C2410C" />
      </linearGradient>
      <linearGradient id="iso_att_face" x1="20" y1="22" x2="44" y2="48" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#FFF7ED" />
        <stop offset="100%" stopColor="#FED7AA" />
      </linearGradient>
    </defs>
    {/* Soft 3D shadow */}
    <ellipse cx="32" cy="56" rx="16" ry="4" fill="#F97316" fillOpacity="0.22" />
    {/* Crown & side button */}
    <rect x="27" y="9" width="10" height="5" rx="2" fill="#EA580C" />
    <rect x="29" y="13" width="6" height="4" fill="#C2410C" />
    <rect x="44" y="17" width="6" height="4" rx="1.5" transform="rotate(35 44 17)" fill="#EA580C" />
    {/* 3D extruded bottom rim */}
    <ellipse cx="32" cy="37" rx="19" ry="18" fill="#C2410C" />
    {/* Main 3D bezel */}
    <circle cx="32" cy="34" r="18" fill="url(#iso_att_body)" />
    {/* Dial */}
    <circle cx="32" cy="34" r="13.5" fill="url(#iso_att_face)" />
    <circle cx="32" cy="34" r="13.5" stroke="#FDBA74" strokeWidth="1" />
    {/* Hands */}
    <path d="M32 25V34L38 38" stroke="#EA580C" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="32" cy="34" r="2.2" fill="#C2410C" />
    {/* Gloss highlight */}
    <path d="M21 24C24 20 29 19 34 19.5" stroke="#FFFFFF" strokeOpacity="0.65" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

/** 3D Isometric Sky-Blue Airplane (Izin Cuti / Leave) */
export const IsoLeavePlaneIcon: React.FC<IsoIconProps> = ({ size = 44 }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
    <defs>
      <linearGradient id="iso_plane_body" x1="12" y1="16" x2="52" y2="48" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#7DD3FC" />
        <stop offset="55%" stopColor="#38BDF8" />
        <stop offset="100%" stopColor="#0284C7" />
      </linearGradient>
      <linearGradient id="iso_plane_wing" x1="18" y1="20" x2="46" y2="46" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#BAE6FD" />
        <stop offset="100%" stopColor="#0EA5E9" />
      </linearGradient>
    </defs>
    <ellipse cx="32" cy="55" rx="17" ry="4" fill="#0EA5E9" fillOpacity="0.2" />
    {/* Fuselage 3D depth */}
    <path d="M32 13C34.5 13 36.5 15.5 36.5 21V44L41 49V52L32 49.5L23 52V49L27.5 44V21C27.5 15.5 29.5 13 32 13Z" fill="#0369A1" transform="translate(0,2.5)" />
    {/* Wings 3D depth */}
    <path d="M12 35L28 27V34L12 40V35Z" fill="#0284C7" />
    <path d="M52 35L36 27V34L52 40V35Z" fill="#0284C7" />
    {/* Top Wings */}
    <path d="M12 33L28 24V32L12 38V33Z" fill="url(#iso_plane_wing)" />
    <path d="M52 33L36 24V32L52 38V33Z" fill="url(#iso_plane_wing)" />
    {/* Fuselage */}
    <path d="M32 11C34.5 11 36.5 13.5 36.5 19V42L41 47V50L32 47.5L23 50V47L27.5 42V19C27.5 13.5 29.5 11 32 11Z" fill="url(#iso_plane_body)" />
    {/* Cockpit glass */}
    <path d="M29.5 16.5C30.8 15.2 33.2 15.2 34.5 16.5L34 19H30L29.5 16.5Z" fill="#E0F2FE" />
  </svg>
);

/** 3D Isometric Emerald Wallet (Gaji / Payslips) */
export const IsoWalletIcon: React.FC<IsoIconProps> = ({ size = 44 }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
    <defs>
      <linearGradient id="iso_wal_front" x1="12" y1="20" x2="50" y2="50" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#A3E635" />
        <stop offset="50%" stopColor="#65A30D" />
        <stop offset="100%" stopColor="#3F6212" />
      </linearGradient>
      <linearGradient id="iso_wal_top" x1="14" y1="14" x2="46" y2="26" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#D9F99D" />
        <stop offset="100%" stopColor="#84CC16" />
      </linearGradient>
    </defs>
    <ellipse cx="32" cy="55" rx="18" ry="4" fill="#65A30D" fillOpacity="0.22" />
    {/* Back flap / 3D top */}
    <path d="M15 21C15 17.5 17.8 15 21.5 15H44.5C47.5 15 49.5 17 49.5 20V25H15V21Z" fill="url(#iso_wal_top)" />
    {/* Bottom 3D thickness */}
    <rect x="13" y="23" width="36" height="27" rx="7" fill="#3F6212" />
    {/* Main wallet body */}
    <rect x="13" y="20" width="36" height="27" rx="7" fill="url(#iso_wal_front)" />
    {/* Clasp */}
    <rect x="37" y="29" width="14" height="10" rx="5" fill="#84CC16" stroke="#BEF264" strokeWidth="1.2" />
    <circle cx="42.5" cy="34" r="2.2" fill="#ECFCCB" />
    {/* Highlight */}
    <path d="M18 23.5H36" stroke="#FFFFFF" strokeOpacity="0.45" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

/** 3D Isometric Desk Calendar (Kalender / Schedule) */
export const IsoCalendarIcon: React.FC<IsoIconProps> = ({ size = 44 }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
    <defs>
      <linearGradient id="iso_cal_head" x1="14" y1="15" x2="50" y2="27" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#FB7185" />
        <stop offset="100%" stopColor="#E11D48" />
      </linearGradient>
    </defs>
    <ellipse cx="32" cy="56" rx="17" ry="4" fill="#E11D48" fillOpacity="0.2" />
    {/* 3D bottom slab */}
    <rect x="14" y="20" width="36" height="32" rx="7" fill="#CBD5E1" />
    {/* Paper body */}
    <rect x="14" y="17" width="36" height="32" rx="7" fill="#FFFFFF" stroke="#E2E8F0" strokeWidth="1" />
    {/* Red header */}
    <path d="M14 24C14 20.1 17.1 17 21 17H43C46.9 17 50 20.1 50 24V27H14V24Z" fill="url(#iso_cal_head)" />
    {/* Binding rings */}
    <rect x="21" y="12" width="4" height="8" rx="2" fill="#94A3B8" />
    <rect x="39" y="12" width="4" height="8" rx="2" fill="#94A3B8" />
    {/* Grid dots */}
    {[0, 1, 2, 3].map((col) =>
      [0, 1].map((row) => (
        <rect
          key={`${col}-${row}`}
          x={19 + col * 7.2}
          y={32 + row * 7}
          width="4.5"
          height="4.5"
          rx="1.2"
          fill={col === 1 && row === 0 ? '#F43F5E' : '#E2E8F0'}
        />
      ))
    )}
  </svg>
);

/** 3D Isometric Amber Receipt (Klaim / Claims) */
export const IsoClaimReceiptIcon: React.FC<IsoIconProps> = ({ size = 44 }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
    <defs>
      <linearGradient id="iso_rec_grad" x1="18" y1="12" x2="46" y2="52" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#FBBF24" />
        <stop offset="60%" stopColor="#F59E0B" />
        <stop offset="100%" stopColor="#B45309" />
      </linearGradient>
    </defs>
    <ellipse cx="32" cy="56" rx="15" ry="3.8" fill="#F59E0B" fillOpacity="0.22" />
    {/* 3D shadow layer */}
    <path d="M19 14H45V50L40 46.5L35 50L30 46.5L25 50L19 46.5V14Z" fill="#B45309" transform="translate(2,2.5)" />
    {/* Main receipt */}
    <path d="M18 12H44V48L39 44.5L34 48L29 44.5L24 48L18 44.5V12Z" fill="url(#iso_rec_grad)" />
    {/* Lines */}
    <rect x="23" y="19" width="16" height="3" rx="1.5" fill="#FFFBEB" fillOpacity="0.9" />
    <rect x="23" y="26" width="12" height="2.8" rx="1.4" fill="#FFFBEB" fillOpacity="0.75" />
    <rect x="23" y="33" width="14" height="2.8" rx="1.4" fill="#FFFBEB" fillOpacity="0.75" />
  </svg>
);

/** 3D Isometric Violet Briefcase (Lembur / Overtime) */
export const IsoOvertimeIcon: React.FC<IsoIconProps> = ({ size = 44 }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
    <defs>
      <linearGradient id="iso_ov_body" x1="14" y1="20" x2="50" y2="50" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#C4B5FD" />
        <stop offset="50%" stopColor="#8B5CF6" />
        <stop offset="100%" stopColor="#5B21B6" />
      </linearGradient>
    </defs>
    <ellipse cx="32" cy="55" rx="17" ry="4" fill="#8B5CF6" fillOpacity="0.22" />
    {/* Handle */}
    <path d="M25 20V16C25 14.3 26.3 13 28 13H36C37.7 13 39 14.3 39 16V20" stroke="#6D28D9" strokeWidth="3.5" strokeLinecap="round" />
    {/* 3D depth */}
    <rect x="13" y="22" width="38" height="28" rx="7" fill="#5B21B6" />
    {/* Front */}
    <rect x="13" y="19" width="38" height="28" rx="7" fill="url(#iso_ov_body)" />
    {/* Flap */}
    <path d="M13 26C13 22.1 16.1 19 20 19H44C47.9 19 51 22.1 51 26V30L32 34L13 30V26Z" fill="#A78BFA" />
    <rect x="28" y="31" width="8" height="5" rx="2.5" fill="#EDE9FE" />
  </svg>
);

/** 3D Isometric Indigo Document Check (Tugas / Tasks) */
export const IsoTasksIcon: React.FC<IsoIconProps> = ({ size = 44 }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
    <defs>
      <linearGradient id="iso_tsk_grad" x1="16" y1="12" x2="48" y2="52" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#A5B4FC" />
        <stop offset="55%" stopColor="#6366F1" />
        <stop offset="100%" stopColor="#3730A3" />
      </linearGradient>
    </defs>
    <ellipse cx="32" cy="55" rx="16" ry="4" fill="#6366F1" fillOpacity="0.2" />
    <rect x="17" y="15" width="30" height="36" rx="7" fill="#3730A3" />
    <rect x="15" y="12" width="30" height="36" rx="7" fill="url(#iso_tsk_grad)" />
    <rect x="21" y="20" width="16" height="3" rx="1.5" fill="#E0E7FF" />
    <rect x="21" y="27" width="12" height="3" rx="1.5" fill="#E0E7FF" fillOpacity="0.8" />
    {/* 3D Check Badge */}
    <circle cx="43" cy="43" r="9" fill="#312E81" transform="translate(1,1.5)" />
    <circle cx="43" cy="43" r="9" fill="#818CF8" stroke="#E0E7FF" strokeWidth="1.5" />
    <path d="M39 43L42 46L47.5 40.5" stroke="#FFFFFF" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/** 3D Isometric Teal User Badge (Profil / Profile) */
export const IsoProfileIcon: React.FC<IsoIconProps> = ({ size = 44 }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
    <defs>
      <linearGradient id="iso_prof_grad" x1="16" y1="14" x2="48" y2="52" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#5EEAD4" />
        <stop offset="55%" stopColor="#14B8A6" />
        <stop offset="100%" stopColor="#0F766E" />
      </linearGradient>
    </defs>
    <ellipse cx="32" cy="55" rx="17" ry="4" fill="#14B8A6" fillOpacity="0.22" />
    {/* 3D back card */}
    <circle cx="32" cy="24" r="9.5" fill="#0F766E" transform="translate(0,2)" />
    <path d="M16 48C16 40 23 35 32 35C41 35 48 40 48 48V50H16V48Z" fill="#0F766E" transform="translate(0,2.5)" />
    {/* Front */}
    <circle cx="32" cy="23" r="9.5" fill="url(#iso_prof_grad)" />
    <path d="M16 47C16 39 23 34 32 34C41 34 48 39 48 47V49C48 50.1 47.1 51 46 51H18C16.9 51 16 50.1 16 49V47Z" fill="url(#iso_prof_grad)" />
    <circle cx="29" cy="20" r="2.5" fill="#FFFFFF" fillOpacity="0.4" />
  </svg>
);

/** 3D Isometric Emerald Banknotes (Kasbon / Salary Advance) */
export const IsoKasbonIcon: React.FC<IsoIconProps> = ({ size = 44 }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
    <defs>
      <linearGradient id="iso_kas_grad" x1="12" y1="20" x2="52" y2="48" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#6EE7B7" />
        <stop offset="55%" stopColor="#10B981" />
        <stop offset="100%" stopColor="#047857" />
      </linearGradient>
    </defs>
    <ellipse cx="32" cy="54" rx="18" ry="4" fill="#10B981" fillOpacity="0.22" />
    <rect x="13" y="23" width="38" height="24" rx="6" fill="#047857" />
    <rect x="13" y="19" width="38" height="24" rx="6" fill="url(#iso_kas_grad)" />
    <circle cx="32" cy="31" r="6.5" fill="#ECFDF5" fillOpacity="0.9" />
    <path d="M32 27.5V34.5M29.8 29.8H34.2M29.8 32.2H34.2" stroke="#059669" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

/** 3D Isometric Cyan Coin Pouch (Petty Cash) */
export const IsoPettyCashIcon: React.FC<IsoIconProps> = ({ size = 44 }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
    <defs>
      <linearGradient id="iso_pet_grad" x1="16" y1="14" x2="48" y2="50" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#67E8F9" />
        <stop offset="55%" stopColor="#06B6D4" />
        <stop offset="100%" stopColor="#0E7490" />
      </linearGradient>
    </defs>
    <ellipse cx="32" cy="55" rx="16" ry="4" fill="#06B6D4" fillOpacity="0.22" />
    <circle cx="32" cy="36" r="16" fill="#0E7490" />
    <circle cx="32" cy="33" r="16" fill="url(#iso_pet_grad)" />
    <circle cx="32" cy="33" r="10.5" stroke="#CFFAFE" strokeWidth="2" strokeDasharray="3 2" />
    <text x="32" y="37" textAnchor="middle" fill="#FFFFFF" fontSize="11" fontWeight="bold">Rp</text>
  </svg>
);

/** 3D Isometric Rose Approval Stamp (Persetujuan / Approvals) */
export const IsoApprovalIcon: React.FC<IsoIconProps> = ({ size = 44 }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
    <defs>
      <linearGradient id="iso_app_grad" x1="16" y1="14" x2="48" y2="50" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#FDA4AF" />
        <stop offset="55%" stopColor="#F43F5E" />
        <stop offset="100%" stopColor="#BE123C" />
      </linearGradient>
    </defs>
    <ellipse cx="32" cy="55" rx="16" ry="4" fill="#F43F5E" fillOpacity="0.22" />
    <circle cx="32" cy="35" r="17" fill="#BE123C" />
    <circle cx="32" cy="32" r="17" fill="url(#iso_app_grad)" />
    <path d="M24.5 32.5L29.5 37.5L40 27" stroke="#FFFFFF" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
