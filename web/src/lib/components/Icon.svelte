<script>
  // Ikon Lucide berdasarkan nama (kebab-case), hanya ikon yang dipakai aplikasi agar bundle kecil
  import {
    House, LayoutGrid, Map, Settings, Plus, SlidersHorizontal, Search, Phone, ArrowUpDown, X, ChevronLeft, ChevronRight,
    Images, CircleCheck, CircleX, Route, Star, DoorOpen, DoorClosed, Snowflake, Bath, Zap, Wifi, BedDouble, CircleAlert,
    MessageCircle, ExternalLink, Pencil, Heart, Undo2, EyeOff, Sparkles, Layers, Building2, WifiOff, Radar, Download, Wallet,
    MapPin, Users, Check, ListChecks, Play, RefreshCw, Database, Repeat, History, Clock, ScanSearch, LoaderCircle, Save,
    CircleDot, Link, Trash2, ArrowLeft, NotebookPen, Navigation, MapPinOff, GitBranch, Info, Briefcase, MapPinned,
    PanelRightClose, List, CircleSlash, Bot, BookmarkPlus, Share2, Copy, ShieldCheck, Eye, UserRound, MessageSquare, LogOut, LockKeyhole,
  } from '@lucide/svelte';

  const IKON = {
    house: House, 'layout-grid': LayoutGrid, map: Map, settings: Settings, plus: Plus, 'sliders-horizontal': SlidersHorizontal,
    search: Search, phone: Phone, 'arrow-up-down': ArrowUpDown, x: X, 'chevron-left': ChevronLeft, 'chevron-right': ChevronRight,
    images: Images, 'circle-check': CircleCheck, 'circle-x': CircleX, route: Route, star: Star, 'door-open': DoorOpen,
    'door-closed': DoorClosed, snowflake: Snowflake, bath: Bath, zap: Zap, wifi: Wifi, 'bed-double': BedDouble,
    'circle-alert': CircleAlert, 'message-circle': MessageCircle, 'external-link': ExternalLink, pencil: Pencil, heart: Heart,
    'undo-2': Undo2, 'eye-off': EyeOff, sparkles: Sparkles, layers: Layers, 'building-2': Building2, 'wifi-off': WifiOff,
    radar: Radar, download: Download, wallet: Wallet, 'map-pin': MapPin, users: Users, check: Check, 'list-checks': ListChecks,
    play: Play, 'refresh-cw': RefreshCw, database: Database, repeat: Repeat, history: History, clock: Clock,
    'scan-search': ScanSearch, 'loader-circle': LoaderCircle, save: Save, 'circle-dot': CircleDot, link: Link,
    'trash-2': Trash2, 'arrow-left': ArrowLeft, 'notebook-pen': NotebookPen, navigation: Navigation, 'map-pin-off': MapPinOff,
    'git-branch': GitBranch, info: Info, briefcase: Briefcase, 'map-pinned': MapPinned, 'panel-right-close': PanelRightClose,
    list: List, 'circle-slash': CircleSlash, bot: Bot, 'bookmark-plus': BookmarkPlus, 'share-2': Share2, copy: Copy, 'shield-check': ShieldCheck, eye: Eye, 'user-round': UserRound, 'message-square': MessageSquare, 'log-out': LogOut, 'lock-keyhole': LockKeyhole,
  };

  let { name, class: cls = '' } = $props();
  const Komponen = $derived(IKON[name]);
</script>

{#if Komponen}<Komponen class="lucide {cls}" size={24} />{/if}
