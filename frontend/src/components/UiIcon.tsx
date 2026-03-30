import type { CSSProperties, SVGProps } from 'react';

export type UiIconName =
  | 'database'
  | 'menu'
  | 'close'
  | 'dashboard'
  | 'plus'
  | 'home'
  | 'folder'
  | 'activity'
  | 'file'
  | 'download'
  | 'printer'
  | 'users'
  | 'settings'
  | 'clipboard'
  | 'map'
  | 'image'
  | 'chart'
  | 'shield'
  | 'lock'
  | 'userPlus'
  | 'userMinus'
  | 'userCheck'
  | 'trash'
  | 'briefcase'
  | 'search'
  | 'refresh'
  | 'spark'
  | 'receipt'
  | 'calendar'
  | 'dollar'
  | 'bell'
  | 'camera'
  | 'building'
  | 'bed'
  | 'bath'
  | 'sofa'
  | 'utensils'
  | 'car'
  | 'logout';

type UiIconProps = {
  name: UiIconName;
  size?: number;
  strokeWidth?: number;
  className?: string;
  style?: CSSProperties;
};

export function UiIcon({
  name,
  size = 18,
  strokeWidth = 1.9,
  className,
  style,
}: UiIconProps) {
  const props: SVGProps<SVGSVGElement> = {
    viewBox: '0 0 24 24',
    width: size,
    height: size,
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    className,
    style,
    'aria-hidden': true,
  };

  switch (name) {
    case 'database':
      return (
        <svg {...props}>
          <ellipse cx="12" cy="5" rx="7" ry="3" />
          <path d="M5 5v6c0 1.7 3.1 3 7 3s7-1.3 7-3V5" />
          <path d="M5 11v8c0 1.7 3.1 3 7 3s7-1.3 7-3v-8" />
        </svg>
      );
    case 'menu':
      return (
        <svg {...props}>
          <path d="M4 7h16" />
          <path d="M4 12h16" />
          <path d="M4 17h16" />
        </svg>
      );
    case 'close':
      return (
        <svg {...props}>
          <path d="m6 6 12 12" />
          <path d="m18 6-12 12" />
        </svg>
      );
    case 'dashboard':
      return (
        <svg {...props}>
          <rect x="3" y="3" width="7" height="7" rx="2" />
          <rect x="14" y="3" width="7" height="10" rx="2" />
          <rect x="3" y="14" width="7" height="7" rx="2" />
          <rect x="14" y="16" width="7" height="5" rx="2" />
        </svg>
      );
    case 'plus':
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 8v8M8 12h8" />
        </svg>
      );
    case 'home':
      return (
        <svg {...props}>
          <path d="M4 10.5 12 4l8 6.5" />
          <path d="M6.5 9.5V20h11V9.5" />
          <path d="M10 20v-5h4v5" />
        </svg>
      );
    case 'folder':
      return (
        <svg {...props}>
          <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H10l2 2h6.5A2.5 2.5 0 0 1 21 9.5v7A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5z" />
        </svg>
      );
    case 'activity':
      return (
        <svg {...props}>
          <path d="M3 12h4l2.2-4.4L14 17l2.3-5H21" />
        </svg>
      );
    case 'file':
      return (
        <svg {...props}>
          <path d="M7 3h7l4 4v14H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" />
          <path d="M14 3v5h5" />
          <path d="M9 13h6M9 17h4" />
        </svg>
      );
    case 'download':
      return (
        <svg {...props}>
          <path d="M12 4v10" />
          <path d="m8 10 4 4 4-4" />
          <path d="M5 20h14" />
        </svg>
      );
    case 'printer':
      return (
        <svg {...props}>
          <path d="M7 8V4h10v4" />
          <rect x="5" y="10" width="14" height="7" rx="2" />
          <path d="M7 15h10v5H7z" />
          <path d="M16 12h.01" />
        </svg>
      );
    case 'users':
      return (
        <svg {...props}>
          <path d="M16.5 20a4.5 4.5 0 0 0-9 0" />
          <circle cx="12" cy="9" r="3" />
          <path d="M20 19a3.5 3.5 0 0 0-4-3.4" />
          <path d="M17 4.8a3 3 0 0 1 0 5.4" />
        </svg>
      );
    case 'settings':
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="3.2" />
          <path d="M19.4 15a1 1 0 0 0 .2 1.1l.1.1a1.8 1.8 0 1 1-2.5 2.5l-.1-.1a1 1 0 0 0-1.1-.2 1 1 0 0 0-.6.9V20a1.8 1.8 0 1 1-3.6 0v-.2a1 1 0 0 0-.7-.9 1 1 0 0 0-1.1.2l-.1.1a1.8 1.8 0 1 1-2.5-2.5l.1-.1a1 1 0 0 0 .2-1.1 1 1 0 0 0-.9-.6H4a1.8 1.8 0 1 1 0-3.6h.2a1 1 0 0 0 .9-.7 1 1 0 0 0-.2-1.1l-.1-.1a1.8 1.8 0 1 1 2.5-2.5l.1.1a1 1 0 0 0 1.1.2 1 1 0 0 0 .6-.9V4a1.8 1.8 0 1 1 3.6 0v.2a1 1 0 0 0 .7.9 1 1 0 0 0 1.1-.2l.1-.1a1.8 1.8 0 1 1 2.5 2.5l-.1.1a1 1 0 0 0-.2 1.1 1 1 0 0 0 .9.6h.2a1.8 1.8 0 1 1 0 3.6h-.2a1 1 0 0 0-.9.7z" />
        </svg>
      );
    case 'clipboard':
      return (
        <svg {...props}>
          <rect x="6" y="4" width="12" height="17" rx="2" />
          <path d="M9 4.5h6a1.5 1.5 0 0 0-1.5-1.5h-3A1.5 1.5 0 0 0 9 4.5Z" />
          <path d="M9 10h6M9 14h6M9 18h4" />
        </svg>
      );
    case 'map':
      return (
        <svg {...props}>
          <path d="M9 18 3 20V6l6-2 6 2 6-2v14l-6 2-6-2z" />
          <path d="M9 4v14M15 6v14" />
        </svg>
      );
    case 'image':
      return (
        <svg {...props}>
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <circle cx="9" cy="10" r="1.5" />
          <path d="m21 15-4.5-4.5L9 18" />
        </svg>
      );
    case 'chart':
      return (
        <svg {...props}>
          <path d="M4 19V9" />
          <path d="M10 19V5" />
          <path d="M16 19v-7" />
          <path d="M22 19V3" />
        </svg>
      );
    case 'shield':
      return (
        <svg {...props}>
          <path d="M12 3 6 5.5v5.7c0 4 2.5 7.5 6 9.3 3.5-1.8 6-5.3 6-9.3V5.5z" />
        </svg>
      );
    case 'lock':
      return (
        <svg {...props}>
          <rect x="5" y="11" width="14" height="10" rx="2" />
          <path d="M8 11V8a4 4 0 1 1 8 0v3" />
        </svg>
      );
    case 'userPlus':
      return (
        <svg {...props}>
          <circle cx="10" cy="8" r="3" />
          <path d="M4.5 19a5.5 5.5 0 0 1 11 0" />
          <path d="M19 8v6M16 11h6" />
        </svg>
      );
    case 'userMinus':
      return (
        <svg {...props}>
          <circle cx="10" cy="8" r="3" />
          <path d="M4.5 19a5.5 5.5 0 0 1 11 0" />
          <path d="M16 11h6" />
        </svg>
      );
    case 'userCheck':
      return (
        <svg {...props}>
          <circle cx="10" cy="8" r="3" />
          <path d="M4.5 19a5.5 5.5 0 0 1 11 0" />
          <path d="m16.5 11.5 2 2 4-4" />
        </svg>
      );
    case 'trash':
      return (
        <svg {...props}>
          <path d="M4 7h16" />
          <path d="M9 7V4h6v3" />
          <path d="M7 7l1 13h8l1-13" />
          <path d="M10 11v6M14 11v6" />
        </svg>
      );
    case 'briefcase':
      return (
        <svg {...props}>
          <rect x="3" y="7" width="18" height="12" rx="2" />
          <path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
          <path d="M3 12h18" />
        </svg>
      );
    case 'search':
      return (
        <svg {...props}>
          <circle cx="11" cy="11" r="6.5" />
          <path d="m20 20-3.5-3.5" />
        </svg>
      );
    case 'refresh':
      return (
        <svg {...props}>
          <path d="M20 6v5h-5" />
          <path d="M4 18v-5h5" />
          <path d="M6.8 9A7 7 0 0 1 18 7l2 4" />
          <path d="M17.2 15A7 7 0 0 1 6 17l-2-4" />
        </svg>
      );
    case 'spark':
      return (
        <svg {...props}>
          <path d="m12 3 1.7 4.3L18 9l-4.3 1.7L12 15l-1.7-4.3L6 9l4.3-1.7z" />
          <path d="m19 15 .9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9z" />
          <path d="m5 16 .8 1.8L8 18.5l-2.2.8L5 21.5l-.8-2.2L2 18.5l2.2-.7z" />
        </svg>
      );
    case 'receipt':
      return (
        <svg {...props}>
          <path d="M7 3h10v18l-2-1.5L13 21l-2-1.5L9 21l-2-1.5L5 21V5a2 2 0 0 1 2-2z" />
          <path d="M9 8h6M9 12h6M9 16h4" />
        </svg>
      );
    case 'calendar':
      return (
        <svg {...props}>
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M16 3v4M8 3v4M3 10h18" />
        </svg>
      );
    case 'dollar':
      return (
        <svg {...props}>
          <path d="M12 3v18" />
          <path d="M16.5 7.5c0-1.9-1.8-3-4.5-3s-4.5 1.1-4.5 3 1.5 2.6 4.5 3 4.5 1.1 4.5 3-1.8 3-4.5 3-4.5-1.1-4.5-3" />
        </svg>
      );
    case 'bell':
      return (
        <svg {...props}>
          <path d="M6 17h12" />
          <path d="M8 17V10a4 4 0 1 1 8 0v7" />
          <path d="M5 17c1.2-.5 2-1.7 2-3V10a5 5 0 1 1 10 0v4c0 1.3.8 2.5 2 3" />
          <path d="M10 20a2 2 0 0 0 4 0" />
        </svg>
      );
    case 'camera':
      return (
        <svg {...props}>
          <path d="M5 8h2l1.5-2h7L17 8h2a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2z" />
          <circle cx="12" cy="13" r="3.5" />
        </svg>
      );
    case 'building':
      return (
        <svg {...props}>
          <rect x="5" y="4" width="14" height="16" rx="2" />
          <path d="M9 8h.01M12 8h.01M15 8h.01M9 12h.01M12 12h.01M15 12h.01M12 20v-4" />
        </svg>
      );
    case 'bed':
      return (
        <svg {...props}>
          <path d="M4 18v-6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v6" />
          <path d="M4 14h16" />
          <path d="M7 10V7h4a3 3 0 0 1 3 3" />
        </svg>
      );
    case 'bath':
      return (
        <svg {...props}>
          <path d="M5 13h14v2a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4z" />
          <path d="M8 13V7a2 2 0 1 1 4 0" />
          <path d="M14 9h4" />
        </svg>
      );
    case 'sofa':
      return (
        <svg {...props}>
          <path d="M6 11V9a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v2" />
          <path d="M4 11h16v5H4z" />
          <path d="M6 16v2M18 16v2" />
        </svg>
      );
    case 'utensils':
      return (
        <svg {...props}>
          <path d="M7 4v8" />
          <path d="M5 4v4M9 4v4" />
          <path d="M7 12v8" />
          <path d="M15 4c2 2 2 5 0 7v9" />
        </svg>
      );
    case 'car':
      return (
        <svg {...props}>
          <path d="M5 15h14l-1.5-4.5A2 2 0 0 0 15.6 9H8.4a2 2 0 0 0-1.9 1.5z" />
          <path d="M4 15v3h2M18 18h2v-3" />
          <circle cx="8" cy="17" r="1.5" />
          <circle cx="16" cy="17" r="1.5" />
        </svg>
      );
    case 'logout':
      return (
        <svg {...props}>
          <path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4" />
          <path d="M14 16l4-4-4-4" />
          <path d="M9 12h9" />
        </svg>
      );
    default:
      return null;
  }
}
