import { useTheme } from '@teable/next-themes';
import colors from 'tailwindcss/colors';
import type { IGridTheme } from '../../grid/configs';
import { hexToRGBA } from '../../grid/utils';

const lightTheme = {} as IGridTheme;

const darkTheme = {
  // Common
  iconFgCommon: colors.zinc[400],

  // Cell
  cellBg: '#1e1e1e',
  cellBgHovered: '#262626',
  cellBgSelected: '#2e2e2e',
  cellBgLoading: hexToRGBA(colors.white, 0.08),
  cellLineColor: hexToRGBA(colors.white, 0.1),
  cellLineColorActived: colors.zinc[300],
  cellTextColor: colors.zinc[200],
  cellOptionBg: colors.zinc[600],
  cellOptionTextColor: colors.zinc[100],

  // Group Header
  groupHeaderBgPrimary: '#141414',
  groupHeaderBgSecondary: '#1e1e1e',
  groupHeaderBgTertiary: '#262626',

  // Column Header
  columnHeaderBg: '#141414',
  columnHeaderBgHovered: '#1e1e1e',
  columnHeaderBgSelected: '#262626',
  columnHeaderNameColor: colors.zinc[200],
  columnResizeHandlerBg: colors.blue[500],
  columnDraggingPlaceholderBg: hexToRGBA(colors.white, 0.2),

  // Column Statistic
  columnStatisticBgHoveredPrimary: '#1e1e1e',
  columnStatisticBgHoveredSecondary: '#262626',
  columnStatisticBgHoveredTertiary: '#2e2e2e',

  // Row Header
  rowHeaderTextColor: colors.zinc[400],

  // Append Row
  appendRowBg: '#141414',
  appendRowBgHovered: '#1e1e1e',

  // Avatar
  avatarBg: colors.zinc[600],
  avatarTextColor: colors.zinc[100],
  avatarSizeXS: 16,
  avatarSizeSM: 20,
  avatarSizeMD: 24,

  themeKey: 'dark',

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
  commentCountTextColor: colors.zinc[900],
} as IGridTheme;

export function useGridTheme(): IGridTheme {
  const { resolvedTheme } = useTheme();
  return resolvedTheme === 'dark' ? darkTheme : lightTheme;
}
