import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RoomPeersNotice } from '@/components/RoomPeersNotice';

describe('RoomPeersNotice', () => {
  it('stays out of the way while the room has one window', () => {
    const { container } = render(<RoomPeersNotice peerCount={0} />);
    expect(container.firstChild).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('names the actual consequence in the singular', () => {
    render(<RoomPeersNotice peerCount={1} />);
    const notice = screen.getByRole('status');
    expect(notice.textContent).toContain('Satu jendela lain aktif.');
    expect(notice.textContent).toContain('aktif. Browser ini membuka room');
    expect(notice.textContent).not.toContain('aktif.Browser');
    expect(notice.textContent).toContain('perangkat berbeda');
    expect(notice.textContent).not.toMatch(/—/);
  });

  it('counts more than one extra window', () => {
    render(<RoomPeersNotice peerCount={3} />);
    expect(screen.getByRole('status').textContent).toContain('3 jendela lain aktif.');
  });
});
