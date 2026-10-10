import type { ComponentType, ReactNode, SVGAttributes } from 'react';
import {
  Activity, AlertCircle, AlertTriangle, AlignCenter, AlignLeft, ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ArrowUpRight,
  AtSign, Award, Ban, BarChart3, Bell, Brush, Briefcase, Bug, Building2, Calendar, Camera, Check, CheckCircle2,
  ChevronDown, ChevronLeft, ChevronRight, ChevronUp, CircleDot, Clock, Cloud, Columns, Command, Compass, Copy,
  Cpu, CreditCard, Crown, Database, Download, Eraser, ExternalLink, Eye, EyeOff, Filter, Fingerprint, Flag, Flame,
  FileText, FlaskConical, Gauge, Gem, Globe, GraduationCap, GripVertical, HandHeart, Hash, Heart, History, Home, Image, ImagePlus,
  Inbox, Info, KeyRound, Languages, Layers, LayoutDashboard, LayoutGrid, LifeBuoy, Link2, ListChecks, Loader2, Lock,
  LogOut, Mail, MapPin, Megaphone, Menu, MessageCircle, MessageSquare, Mic, Minus, Monitor, Moon, MoreHorizontal,
  MousePointerClick, Music2, Newspaper, Package, Palette, PanelLeft, Pause, Pencil, Phone, PieChart, Play, Plus,
  QrCode, Radio, Receipt, Redo2, RefreshCw, RotateCcw, Rocket, Save, Scale, ScrollText, Search, Send, Server, Settings,
  Shapes, Share2, Shield, ShieldCheck, SlidersHorizontal, Smartphone, Sparkles, Star, Store, Sun, Tablet, Target,
  Terminal, Ticket, Trash2, TrendingDown, TrendingUp, Type, Undo2, Unlink, Upload, User, UserCheck, UserCog, Users,
  Video, Wallet, Wifi, WifiOff, Wrench, X, XCircle, Zap,
} from 'lucide-react';

type LucideLike = ComponentType<{ size?: number | string; strokeWidth?: number | string; 'aria-hidden'?: boolean | 'true' | 'false'; className?: string }>;

const lucide = {
  activity: Activity, alert: AlertTriangle, 'alert-circle': AlertCircle, 'align-center': AlignCenter, 'align-left': AlignLeft,
  'arrow-down': ArrowDown, 'arrow-left': ArrowLeft, 'arrow-right': ArrowRight, 'arrow-up': ArrowUp, 'arrow-up-right': ArrowUpRight,
  at: AtSign, award: Award, ban: Ban, chart: BarChart3, bell: Bell, brush: Brush, briefcase: Briefcase, bug: Bug,
  building: Building2, calendar: Calendar, camera: Camera, check: Check, 'check-circle': CheckCircle2,
  'chevron-down': ChevronDown, 'chevron-left': ChevronLeft, 'chevron-right': ChevronRight, 'chevron-up': ChevronUp,
  dot: CircleDot, clock: Clock, cloud: Cloud, columns: Columns, command: Command, compass: Compass, copy: Copy,
  cpu: Cpu, 'credit-card': CreditCard, crown: Crown, database: Database, download: Download, eraser: Eraser,
  external: ExternalLink, eye: Eye, 'eye-off': EyeOff, filter: Filter, fingerprint: Fingerprint, flag: Flag, flame: Flame, flask: FlaskConical,
  file: FileText, gauge: Gauge, gem: Gem, globe: Globe, graduation: GraduationCap, grip: GripVertical, 'hand-heart': HandHeart,
  hash: Hash, heart: Heart, history: History, home: Home, image: Image, 'image-plus': ImagePlus, inbox: Inbox, info: Info,
  key: KeyRound, languages: Languages, layers: Layers, dashboard: LayoutDashboard, grid: LayoutGrid, lifebuoy: LifeBuoy,
  link: Link2, checklist: ListChecks, loader: Loader2, lock: Lock, logout: LogOut, mail: Mail, pin: MapPin,
  megaphone: Megaphone, menu: Menu, chat: MessageCircle, message: MessageSquare, mic: Mic, minus: Minus, monitor: Monitor,
  moon: Moon, more: MoreHorizontal, click: MousePointerClick, music: Music2, news: Newspaper, package: Package,
  palette: Palette, sidebar: PanelLeft, pause: Pause, pencil: Pencil, phone: Phone, pie: PieChart, play: Play, plus: Plus,
  qr: QrCode, radio: Radio, receipt: Receipt, redo: Redo2, refresh: RefreshCw, reset: RotateCcw, rocket: Rocket, save: Save,
  scale: Scale, scroll: ScrollText, search: Search, send: Send, server: Server, settings: Settings, shapes: Shapes,
  share: Share2, shield: Shield, 'shield-check': ShieldCheck, sliders: SlidersHorizontal, smartphone: Smartphone,
  sparkles: Sparkles, star: Star, store: Store, sun: Sun, tablet: Tablet, target: Target, terminal: Terminal,
  ticket: Ticket, trash: Trash2, 'trend-down': TrendingDown, 'trend-up': TrendingUp, type: Type, undo: Undo2,
  unlink: Unlink, upload: Upload, user: User, 'user-check': UserCheck, 'user-cog': UserCog, users: Users, video: Video,
  wallet: Wallet, wifi: Wifi, 'wifi-off': WifiOff, wrench: Wrench, x: X, 'x-circle': XCircle, zap: Zap,
} satisfies Record<string, LucideLike>;

/** Glyphes de marques (remplis, viewBox 24) — dessinés en interne, lucide ne les fournit plus. */
const brand: Record<string, ReactNode> = {
  instagram: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="5" fill="none" stroke="currentColor" strokeWidth="2" />
      <circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" strokeWidth="2" />
      <circle cx="17.3" cy="6.7" r="1.2" />
    </>
  ),
  facebook: <path d="M14 8.2V6.6c0-.8.3-1.1 1.1-1.1H17V2h-2.7C11.3 2 10 3.7 10 6.2v2H7.5V12H10v10h4V12h2.7l.6-3.8H14z" />,
  tiktok: <path d="M16.2 2h-3.4v13.1a2.8 2.8 0 1 1-2-2.7V9a6.2 6.2 0 1 0 5.4 6.1V8.7A7.6 7.6 0 0 0 20.8 10V6.6A4.4 4.4 0 0 1 16.2 2z" />,
  youtube: <path fillRule="evenodd" d="M6.5 5h11A4.5 4.5 0 0 1 22 9.5v5a4.5 4.5 0 0 1-4.5 4.5h-11A4.5 4.5 0 0 1 2 14.5v-5A4.5 4.5 0 0 1 6.5 5zM10 9.3v5.4l4.6-2.7z" />,
  linkedin: (
    <path d="M4.2 9h3.6v11H4.2V9zm1.8-5.5a2.1 2.1 0 1 1 0 4.2 2.1 2.1 0 0 1 0-4.2zM10 9h3.4v1.5c.5-.9 1.7-1.8 3.5-1.8 3.6 0 4.2 2.3 4.2 5.4V20h-3.6v-5.1c0-1.3 0-2.9-1.8-2.9s-2 1.4-2 2.8V20H10V9z" />
  ),
  x: <path d="M17.8 3h3.1l-6.8 7.7L22 21h-6.3l-4.9-6.4L5.2 21H2l7.3-8.3L1.6 3h6.4l4.4 5.9L17.8 3zm-1.1 16.2h1.7L7 4.7H5.2l11.5 14.5z" />,
  whatsapp: (
    <>
      <path d="M3.2 20.8l1.3-4.6A9 9 0 1 1 8 19.6l-4.8 1.2z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M9.2 7.8c-.4.4-.8 1-.5 2 .6 1.8 2.3 3.9 4.6 4.7 1.2.4 1.9 0 2.3-.5l.2-.9-1.8-.9-.8.8c-1-.4-2-1.4-2.4-2.4l.8-.8-.8-1.9-1.6.9z" />
    </>
  ),
  telegram: <path d="M21.5 3.6 2.9 10.8c-.8.3-.8 1.4 0 1.7l4.6 1.5 1.8 5.6c.2.7 1.1.9 1.6.4l2.5-2.4 4.6 3.4c.6.4 1.4.1 1.6-.6l3.2-15.3c.2-.9-.7-1.6-1.4-1.3zM9.6 13.6l8.2-5.1-6.4 6.3-.3 3.4-1.5-4.6z" />,
};

export type IconName = keyof typeof lucide | keyof typeof brand;
export const isBrandIcon = (name: string): name is keyof typeof brand => name in brand;

export interface IconProps extends Omit<SVGAttributes<SVGSVGElement>, 'name'> {
  name: IconName;
  size?: number;
  strokeWidth?: number;
  /** Texte alternatif ; absent = icône décorative. */
  label?: string;
}

export function Icon({ name, size = 20, strokeWidth = 2, label, className, ...rest }: IconProps) {
  const a11y = label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true as const };
  if (name in brand) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className} {...a11y} {...rest}>
        {brand[name]}
      </svg>
    );
  }
  const Cmp = lucide[name as keyof typeof lucide];
  if (label) {
    return (
      <span role="img" aria-label={label} style={{ display: 'inline-flex' }}>
        <Cmp size={size} strokeWidth={strokeWidth} aria-hidden="true" className={className} />
      </span>
    );
  }
  return <Cmp size={size} strokeWidth={strokeWidth} aria-hidden="true" className={className} />;
}
