import colors from 'tailwindcss/colors';
import { hexToRGBA } from '../utils';

export interface IGridTheme {
  staticWhite: string;
  staticBlack: string;
  iconBgCommon: string;
  iconFgCommon: string;
  iconFgHighlight: string;
  iconBgHighlight: string;
  iconBgSelected: string;
  iconFgSelected: string;
  iconSizeXS: number;
  iconSizeSM: number;
  iconSizeMD: number;
  iconSizeLG: number;
  fontSizeXXS: number;
  fontSizeXS: number;
  fontSizeSM: number;
  fontSizeMD: number;
  fontSizeLG: number;
  fontFamily: string;
  cellBg: string;
  cellBgHovered: string;
  cellBgSelected: string;
  cellBgLoading: string;
  cellLineColor: string;
  cellLineColorActived: string;
  cellTextColor: string;
  cellTextColorHighlight: string;
  cellOptionBg: string;
  cellOptionBgHighlight: string;
  cellOptionTextColor: string;
  groupHeaderBgPrimary: string;
  groupHeaderBgSecondary: string;
  groupHeaderBgTertiary: string;
  columnHeaderBg: string;
  columnHeaderBgHovered: string;
  columnHeaderBgSelected: string;
  columnHeaderNameColor: string;
  columnResizeHandlerBg: string;
  columnDraggingPlaceholderBg: string;
  columnStatisticBgHoveredPrimary: string;
  columnStatisticBgHoveredSecondary: string;
  columnStatisticBgHoveredTertiary: string;
  rowHeaderTextColor: string;
  appendRowBg: string;
  appendRowBgHovered: string;
  avatarBg: string;
  avatarTextColor: string;
  avatarSizeXS: number;
  avatarSizeSM: number;
  avatarSizeMD: number;
  themeKey: string;
  scrollBarBg: string;
  interactionLineColorCommon: string;
  interactionLineColorHighlight: string;
  searchCursorBg: string;
  searchTargetIndexBg: string;
  commentCountBg: string;
  commentCountTextColor: string;
}

export const gridTheme: IGridTheme = {
  // Common
  staticWhite: '#FFFFFF',
  staticBlack: '#000000',
  iconFgCommon: colors.zinc[400],
  iconBgCommon: colors.transparent,
  iconFgHighlight: colors.yellow[400],
  iconBgHighlight: colors.yellow[400],
  iconFgSelected: colors.blue[50],
  iconBgSelected: colors.black,
  iconSizeXS: 16,
  iconSizeSM: 20,
  iconSizeMD: 24,
  iconSizeLG: 32,
  fontSizeXXS: 10,
  fontSizeXS: 12,
  fontSizeSM: 13,
  fontSizeMD: 14,
  fontSizeLG: 16,
  fontFamily:
    'Inter, Roboto, -apple-system, BlinkMacSystemFont, avenir next, avenir, segoe ui, helvetica neue, helvetica, Ubuntu, noto, arial, sans-serif',

  // Cell
  cellBg: '#1e1e1e',
  cellBgHovered: '#262626',
  cellBgSelected: '#2e2e2e',
  cellBgLoading: hexToRGBA(colors.white, 0.08),
  cellLineColor: hexToRGBA(colors.white, 0.1),
  cellLineColorActived: colors.zinc[300],
  cellTextColor: colors.zinc[200],
  cellTextColorHighlight: colors.violet[400],
  cellOptionBg: colors.zinc[600],
  cellOptionBgHighlight: colors.zinc[500],
  cellOptionTextColor: colors.zinc[100],

  // Group Header
  groupHeaderBgPrimary: '#141414',
  groupHeaderBgSecondary: '#1e1e1e',
  groupHeaderBgTertiary: '#262626',

  // Column Statistic
  columnStatisticBgHoveredPrimary: '#1e1e1e',
  columnStatisticBgHoveredSecondary: '#262626',
  columnStatisticBgHoveredTertiary: '#2e2e2e',

  // Column Header
  columnHeaderBg: '#141414',
  columnHeaderBgHovered: '#1e1e1e',
  columnHeaderBgSelected: '#262626',
  columnHeaderNameColor: colors.zinc[200],
  columnResizeHandlerBg: colors.blue[500],
  columnDraggingPlaceholderBg: hexToRGBA(colors.white, 0.2),

  // Row Header
  rowHeaderTextColor: colors.zinc[400],

  // Append Row
  appendRowBg: '#141414',
  appendRowBgHovered: '#1e1e1e',

  // Avatar Theme
  avatarBg: colors.zinc[600],
  avatarTextColor: colors.zinc[100],
  avatarSizeXS: 16,
  avatarSizeSM: 20,
  avatarSizeMD: 24,

  themeKey: 'light',

  // ScrollBar
  scrollBarBg: colors.zinc[500],

  // interaction
  interactionLineColorCommon: hexToRGBA(colors.white, 0.15),
  interactionLineColorHighlight: colors.blue[500],

  // search cursor
  searchCursorBg: '#243854',
  searchTargetIndexBg: '#172231',

  // comment
  commentCountBg: colors.orange[400],
  commentCountTextColor: colors.white,
};
