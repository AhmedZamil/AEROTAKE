import type { IconType } from "react-icons";
import {
  LuArmchair,
  LuArrowLeftRight,
  LuBell,
  LuBriefcase,
  LuCalendar,
  LuCalendarDays,
  LuCamera,
  LuFlashlight,
  LuImage,
  LuShield,
  LuChartColumn,
  LuCheck,
  LuChevronDown,
  LuChevronLeft,
  LuChevronRight,
  LuChevronUp,
  LuCircleHelp,
  LuClock,
  LuCopy,
  LuDownload,
  LuDollarSign,
  LuEllipsisVertical,
  LuExternalLink,
  LuFileText,
  LuGlobe,
  LuHeadphones,
  LuHotel,
  LuInfo,
  LuLayoutGrid,
  LuLock,
  LuLogOut,
  LuLuggage,
  LuMenu,
  LuMessageCircle,
  LuMinus,
  LuPanelLeftClose,
  LuPanelLeftOpen,
  LuPencil,
  LuPhone,
  LuSettings,
  LuPlaneLanding,
  LuPlaneTakeoff,
  LuPlus,
  LuRocket,
  LuRotateCcw,
  LuRoute,
  LuSearch,
  LuSend,
  LuSlidersHorizontal,
  LuSun,
  LuSunrise,
  LuSunset,
  LuMoon,
  LuTimer,
  LuTicket,
  LuTicketPlus,
  LuUndo2,
  LuUser,
  LuUserPlus,
  LuUsers,
  LuWallet,
  LuX,
} from "react-icons/lu";

type IconProps = { className?: string };

function wrap(Icon: IconType, defaultClass: string) {
  return function WrappedIcon({ className = defaultClass }: IconProps) {
    return <Icon className={className} aria-hidden />;
  };
}

export function BrandMark({ className = "h-8 w-8" }: IconProps) {
  return (
    <svg viewBox="0 0 48 48" className={className} fill="none" aria-hidden>
      <path
        d="M8 30.5 24.2 8.4c.5-.7 1.6-.5 1.8.3l3.4 12.6 12.2 4.2c.8.3.8 1.4 0 1.7L24.8 35.5 8 30.5Z"
        fill="currentColor"
      />
      <path
        d="M24.5 21.2 14.2 33.8c-.4.5.1 1.2.7.9l9.6-4.1 10.4 2.1c.7.1 1.1-.7.6-1.2L24.5 21.2Z"
        fill="currentColor"
        opacity="0.55"
      />
    </svg>
  );
}

export const MenuIcon = wrap(LuMenu, "h-5 w-5");
export const CloseIcon = wrap(LuX, "h-4 w-4");
export const GridIcon = wrap(LuLayoutGrid, "h-[18px] w-[18px]");
export const SearchIcon = wrap(LuSearch, "h-[18px] w-[18px]");
export const PriceCheckIcon = wrap(LuChartColumn, "h-[18px] w-[18px]");
export const BookingsIcon = wrap(LuCalendarDays, "h-[18px] w-[18px]");
export const TicketAlertIcon = wrap(LuTicket, "h-[18px] w-[18px]");
export const WalletIcon = wrap(LuWallet, "h-[18px] w-[18px]");
export const QuotationIcon = wrap(LuFileText, "h-[18px] w-[18px]");
export const SupportIcon = wrap(LuHeadphones, "h-[18px] w-[18px]");
export const ReportsIcon = wrap(LuChartColumn, "h-[18px] w-[18px]");
export const PassengersIcon = wrap(LuUsers, "h-[18px] w-[18px]");
export const LogoutIcon = wrap(LuLogOut, "h-[18px] w-[18px]");
export const BellIcon = wrap(LuBell, "h-5 w-5");
export const ChatIcon = wrap(LuMessageCircle, "h-5 w-5");
export const ChevronDownIcon = wrap(LuChevronDown, "h-4 w-4");
export const ChevronLeftIcon = wrap(LuChevronLeft, "h-4 w-4");
export const ChevronRightIcon = wrap(LuChevronRight, "h-4 w-4");
export const ChevronUpIcon = wrap(LuChevronUp, "h-4 w-4");
export const FilterIcon = wrap(LuSlidersHorizontal, "h-4 w-4");
export const ExternalIcon = wrap(LuExternalLink, "h-3.5 w-3.5");
export const PlaneTakeoffIcon = wrap(LuPlaneTakeoff, "h-5 w-5");
export const PlaneLandingIcon = wrap(LuPlaneLanding, "h-5 w-5");
export const HotelIcon = wrap(LuHotel, "h-5 w-5");
export const TourIcon = wrap(LuGlobe, "h-5 w-5");
export const SwapIcon = wrap(LuArrowLeftRight, "h-4 w-4");
export const CalendarIcon = wrap(LuCalendar, "h-5 w-5");
export const UserIcon = wrap(LuUser, "h-5 w-5");
export const PhoneIcon = wrap(LuPhone, "h-5 w-5");
export const PlusTicketIcon = wrap(LuTicketPlus, "h-5 w-5");
export const HoldIcon = wrap(LuClock, "h-5 w-5");
export const EnquiryIcon = wrap(LuCircleHelp, "h-5 w-5");
export const RefundIcon = wrap(LuUndo2, "h-5 w-5");
export const CheckIcon = wrap(LuCheck, "h-3.5 w-3.5");
export const DollarIcon = wrap(LuDollarSign, "h-5 w-5");
export const TicketStubIcon = wrap(LuTicket, "h-5 w-5");
export const RocketIcon = wrap(LuRocket, "h-5 w-5");
export const UserPlusIcon = wrap(LuUserPlus, "h-5 w-5");
export const PlusIcon = wrap(LuPlus, "h-5 w-5");
export const MinusIcon = wrap(LuMinus, "h-5 w-5");
export const HandBagIcon = wrap(LuBriefcase, "h-4 w-4");
export const SuitcaseIcon = wrap(LuLuggage, "h-4 w-4");
export const SeatIcon = wrap(LuArmchair, "h-4 w-4");
export const UndoIcon = wrap(LuRotateCcw, "h-4 w-4");
export const RouteIcon = wrap(LuRoute, "h-5 w-5");
export const InfoIcon = wrap(LuInfo, "h-3.5 w-3.5");
export const CopyIcon = wrap(LuCopy, "h-4 w-4");
export const MoreIcon = wrap(LuEllipsisVertical, "h-5 w-5");
export const DownloadIcon = wrap(LuDownload, "h-4 w-4");
export const ClockIcon = wrap(LuClock, "h-5 w-5");
export const SendIcon = wrap(LuSend, "h-4 w-4");
export const TimerIcon = wrap(LuTimer, "h-4 w-4");
export const SunriseIcon = wrap(LuSunrise, "h-4 w-4");
export const SunIcon = wrap(LuSun, "h-4 w-4");
export const SunsetIcon = wrap(LuSunset, "h-4 w-4");
export const MoonIcon = wrap(LuMoon, "h-4 w-4");
export const PencilIcon = wrap(LuPencil, "h-4 w-4");
export const SettingsIcon = wrap(LuSettings, "h-4 w-4");
export const CameraIcon = wrap(LuCamera, "h-4 w-4");
export const LockIcon = wrap(LuLock, "h-4 w-4");
export const FlashlightIcon = wrap(LuFlashlight, "h-5 w-5");
export const ImageIcon = wrap(LuImage, "h-5 w-5");
export const ShieldIcon = wrap(LuShield, "h-4 w-4");

export function SidebarToggleIcon({ collapsed = false }: { collapsed?: boolean }) {
  const Icon = collapsed ? LuPanelLeftOpen : LuPanelLeftClose;
  return <Icon className="h-5 w-5" aria-hidden />;
}
