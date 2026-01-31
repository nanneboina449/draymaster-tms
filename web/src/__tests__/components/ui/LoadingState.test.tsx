import React from 'react';
import { render, screen } from '@testing-library/react';
import {
  Spinner,
  PageLoading,
  Skeleton,
  SkeletonText,
  SkeletonCard,
  SkeletonTable,
  LoadingButton,
  InlineLoading,
} from '@/components/ui/LoadingState';
import userEvent from '@testing-library/user-event';

describe('Spinner', () => {
  it('should render with default medium size', () => {
    render(<Spinner />);
    const spinner = screen.getByRole('status');
    expect(spinner).toBeInTheDocument();
    expect(spinner).toHaveClass('h-8', 'w-8');
  });

  it('should render with small size', () => {
    render(<Spinner size="sm" />);
    const spinner = screen.getByRole('status');
    expect(spinner).toHaveClass('h-4', 'w-4');
  });

  it('should render with large size', () => {
    render(<Spinner size="lg" />);
    const spinner = screen.getByRole('status');
    expect(spinner).toHaveClass('h-12', 'w-12');
  });

  it('should have accessible label', () => {
    render(<Spinner />);
    expect(screen.getByLabelText('Loading')).toBeInTheDocument();
    expect(screen.getByText('Loading...')).toHaveClass('sr-only');
  });

  it('should apply custom className', () => {
    render(<Spinner className="custom-class" />);
    const spinner = screen.getByRole('status');
    expect(spinner).toHaveClass('custom-class');
  });
});

describe('PageLoading', () => {
  it('should render with default message', () => {
    render(<PageLoading />);
    // Use getAllByText since both spinner sr-only and message show "Loading..."
    const loadingTexts = screen.getAllByText('Loading...');
    expect(loadingTexts.length).toBeGreaterThanOrEqual(1);
    // Check specifically for the visible message (not sr-only)
    expect(screen.getByText('Loading...', { selector: 'p' })).toBeInTheDocument();
  });

  it('should render with custom message', () => {
    render(<PageLoading message="Fetching data..." />);
    expect(screen.getByText('Fetching data...')).toBeInTheDocument();
  });

  it('should include a spinner', () => {
    render(<PageLoading />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});

describe('Skeleton', () => {
  it('should render skeleton element', () => {
    const { container } = render(<Skeleton />);
    const skeleton = container.firstChild as HTMLElement;
    expect(skeleton).toHaveClass('animate-pulse', 'bg-gray-200', 'rounded');
  });

  it('should be hidden from screen readers', () => {
    const { container } = render(<Skeleton />);
    const skeleton = container.firstChild as HTMLElement;
    expect(skeleton).toHaveAttribute('aria-hidden', 'true');
  });

  it('should apply custom className', () => {
    const { container } = render(<Skeleton className="h-10 w-full" />);
    const skeleton = container.firstChild as HTMLElement;
    expect(skeleton).toHaveClass('h-10', 'w-full');
  });
});

describe('SkeletonText', () => {
  it('should render default 3 lines', () => {
    const { container } = render(<SkeletonText />);
    const lines = container.querySelectorAll('.animate-pulse');
    expect(lines).toHaveLength(3);
  });

  it('should render custom number of lines', () => {
    const { container } = render(<SkeletonText lines={5} />);
    const lines = container.querySelectorAll('.animate-pulse');
    expect(lines).toHaveLength(5);
  });

  it('should make last line shorter', () => {
    const { container } = render(<SkeletonText lines={3} />);
    const lines = container.querySelectorAll('.animate-pulse');
    expect(lines[2]).toHaveClass('w-3/4');
    expect(lines[0]).toHaveClass('w-full');
    expect(lines[1]).toHaveClass('w-full');
  });

  it('should apply custom className', () => {
    const { container } = render(<SkeletonText className="custom-class" />);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper).toHaveClass('custom-class');
  });
});

describe('SkeletonCard', () => {
  it('should render card structure', () => {
    const { container } = render(<SkeletonCard />);
    const card = container.firstChild as HTMLElement;
    expect(card).toHaveClass('bg-white', 'rounded-lg', 'shadow', 'p-4');
  });

  it('should render title skeleton', () => {
    const { container } = render(<SkeletonCard />);
    const skeletons = container.querySelectorAll('.animate-pulse');
    // First skeleton should be the title (h-6 w-1/3)
    expect(skeletons[0]).toHaveClass('h-6', 'w-1/3');
  });

  it('should include skeleton text lines', () => {
    const { container } = render(<SkeletonCard />);
    // Title + 3 text lines = 4 skeleton elements
    const skeletons = container.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThanOrEqual(4);
  });

  it('should apply custom className', () => {
    const { container } = render(<SkeletonCard className="custom-class" />);
    const card = container.firstChild as HTMLElement;
    expect(card).toHaveClass('custom-class');
  });
});

describe('SkeletonTable', () => {
  it('should render default 5 rows and 4 columns', () => {
    const { container } = render(<SkeletonTable />);
    // Header row + 5 data rows
    const rows = container.querySelectorAll('.flex.gap-4');
    expect(rows).toHaveLength(6); // 1 header + 5 rows
  });

  it('should render custom number of rows and columns', () => {
    const { container } = render(<SkeletonTable rows={3} cols={2} />);
    const rows = container.querySelectorAll('.flex.gap-4');
    expect(rows).toHaveLength(4); // 1 header + 3 rows

    // Check each row has 2 columns
    rows.forEach((row) => {
      const cols = row.querySelectorAll('.animate-pulse');
      expect(cols).toHaveLength(2);
    });
  });

  it('should have header styling', () => {
    const { container } = render(<SkeletonTable />);
    const header = container.querySelector('.bg-gray-50');
    expect(header).toBeInTheDocument();
  });
});

describe('LoadingButton', () => {
  it('should render children', () => {
    render(<LoadingButton>Click me</LoadingButton>);
    expect(screen.getByRole('button')).toHaveTextContent('Click me');
  });

  it('should show spinner when loading', () => {
    render(<LoadingButton loading>Submit</LoadingButton>);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('should be disabled when loading', () => {
    render(<LoadingButton loading>Submit</LoadingButton>);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('should be disabled when disabled prop is true', () => {
    render(<LoadingButton disabled>Submit</LoadingButton>);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('should call onClick when clicked', async () => {
    const handleClick = jest.fn();
    render(<LoadingButton onClick={handleClick}>Click me</LoadingButton>);

    await userEvent.click(screen.getByRole('button'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('should not call onClick when loading', async () => {
    const handleClick = jest.fn();
    render(<LoadingButton onClick={handleClick} loading>Click me</LoadingButton>);

    await userEvent.click(screen.getByRole('button'));
    expect(handleClick).not.toHaveBeenCalled();
  });

  it('should render primary variant by default', () => {
    render(<LoadingButton>Primary</LoadingButton>);
    expect(screen.getByRole('button')).toHaveClass('bg-blue-600');
  });

  it('should render secondary variant', () => {
    render(<LoadingButton variant="secondary">Secondary</LoadingButton>);
    expect(screen.getByRole('button')).toHaveClass('bg-gray-200');
  });

  it('should render danger variant', () => {
    render(<LoadingButton variant="danger">Delete</LoadingButton>);
    expect(screen.getByRole('button')).toHaveClass('bg-red-600');
  });

  it('should set button type', () => {
    render(<LoadingButton type="submit">Submit</LoadingButton>);
    expect(screen.getByRole('button')).toHaveAttribute('type', 'submit');
  });

  it('should default to button type', () => {
    render(<LoadingButton>Button</LoadingButton>);
    expect(screen.getByRole('button')).toHaveAttribute('type', 'button');
  });

  it('should apply custom className', () => {
    render(<LoadingButton className="custom-class">Button</LoadingButton>);
    expect(screen.getByRole('button')).toHaveClass('custom-class');
  });
});

describe('InlineLoading', () => {
  it('should render with default text', () => {
    render(<InlineLoading />);
    // Use selector to get the visible span, not the sr-only one
    expect(screen.getByText('Loading...', { selector: 'span.text-sm' })).toBeInTheDocument();
  });

  it('should render with custom text', () => {
    render(<InlineLoading text="Saving..." />);
    expect(screen.getByText('Saving...')).toBeInTheDocument();
  });

  it('should include a spinner', () => {
    render(<InlineLoading />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});
