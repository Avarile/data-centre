import { vi } from 'vitest';
import { render, screen, userEvent } from '@/test-utils';
import { CategoryMenu } from './CategoryMenu';

vi.mock('@teable/openapi', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, getTemplateCategoryList: vi.fn().mockResolvedValue({ data: [] }) };
});

const renderMenu = (
  props: Partial<React.ComponentProps<typeof CategoryMenu>> & {
    onFeaturedChange: (isFeatured: boolean | undefined) => void;
  }
) =>
  render(
    <CategoryMenu
      currentCategoryId={null}
      onCategoryChange={vi.fn()}
      isFeatured={undefined}
      disabledFeaturedToggle={false}
      {...props}
    />
  );

describe('CategoryMenu featured toggle', () => {
  it('asks for featured templates when switched on', async () => {
    const onFeaturedChange = vi.fn();
    renderMenu({ onFeaturedChange });

    const toggle = screen.getByRole('switch');
    expect(toggle).toHaveAttribute('aria-checked', 'false');

    await userEvent.click(toggle);

    expect(onFeaturedChange).toHaveBeenCalledWith(true);
  });

  it('clears the filter with undefined when switched off, never false', async () => {
    const onFeaturedChange = vi.fn();
    renderMenu({ onFeaturedChange, isFeatured: true });

    const toggle = screen.getByRole('switch');
    expect(toggle).toHaveAttribute('aria-checked', 'true');

    await userEvent.click(toggle);

    // false is not an equivalent "off": the API reads it as "not featured" and would hide exactly
    // the curated templates the user is trying to see. Only undefined drops the filter.
    expect(onFeaturedChange).toHaveBeenCalledWith(undefined);
    expect(onFeaturedChange).not.toHaveBeenCalledWith(false);
  });

  it('hides the toggle when the caller disables it', () => {
    renderMenu({ onFeaturedChange: vi.fn(), disabledFeaturedToggle: true });

    expect(screen.queryByRole('switch')).toBeNull();
  });
});
