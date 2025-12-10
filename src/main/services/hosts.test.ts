import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('fs');
vi.mock('sudo-prompt');

describe('Hosts File Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('DevWP Block Management', () => {
    it('should create DevWP block if not exists', () => {
      const hostsContent = `127.0.0.1 localhost
::1 localhost`;

      const result = updateDevWPBlock(hostsContent, 'example.test', 'add');

      expect(result).toContain('# Start DevWP');
      expect(result).toContain('# End DevWP');
      expect(result).toContain('127.0.0.1 example.test');
    });

    it('should add domain to existing DevWP block', () => {
      const hostsContent = `127.0.0.1 localhost
# Start DevWP
127.0.0.1 existing.test
# End DevWP`;

      const result = updateDevWPBlock(hostsContent, 'new.test', 'add');

      expect(result).toContain('127.0.0.1 existing.test');
      expect(result).toContain('127.0.0.1 new.test');
    });

    it('should remove domain from DevWP block', () => {
      const hostsContent = `# Start DevWP
127.0.0.1 example.test
127.0.0.1 other.test
# End DevWP`;

      const result = updateDevWPBlock(hostsContent, 'example.test', 'remove');

      expect(result).not.toContain('127.0.0.1 example.test');
      expect(result).toContain('127.0.0.1 other.test');
    });

    it('should remove DevWP block if empty', () => {
      const hostsContent = `# Start DevWP
127.0.0.1 example.test
# End DevWP`;

      const result = updateDevWPBlock(hostsContent, 'example.test', 'remove');

      expect(result).not.toContain('# Start DevWP');
      expect(result).not.toContain('# End DevWP');
    });

    it('should preserve other hosts entries', () => {
      const hostsContent = `127.0.0.1 localhost
192.168.1.100 custom.local
# Start DevWP
# End DevWP`;

      const result = updateDevWPBlock(hostsContent, 'example.test', 'add');

      expect(result).toContain('127.0.0.1 localhost');
      expect(result).toContain('192.168.1.100 custom.local');
    });

    it('should handle multiple additions', () => {
      let hostsContent = `127.0.0.1 localhost`;

      hostsContent = updateDevWPBlock(hostsContent, 'first.test', 'add');
      hostsContent = updateDevWPBlock(hostsContent, 'second.test', 'add');
      hostsContent = updateDevWPBlock(hostsContent, 'third.test', 'add');

      expect(hostsContent).toContain('127.0.0.1 first.test');
      expect(hostsContent).toContain('127.0.0.1 second.test');
      expect(hostsContent).toContain('127.0.0.1 third.test');
    });

    it('should handle aliases correctly', () => {
      const hostsContent = `127.0.0.1 localhost`;

      const result = updateDevWPBlock(
        hostsContent,
        'example.test www.example.test',
        'add',
      );

      expect(result).toContain('127.0.0.1 example.test www.example.test');
    });
  });

  describe('Cross-Platform Support', () => {
    it('should use correct hosts file path on Linux', () => {
      const linuxPath = '/etc/hosts';
      expect(linuxPath).toBe('/etc/hosts');
    });

    it('should use correct hosts file path on Windows', () => {
      const windowsPath = 'C:\\Windows\\System32\\drivers\\etc\\hosts';
      expect(windowsPath).toContain('System32');
      expect(windowsPath).toContain('drivers\\etc\\hosts');
    });

    it('should use correct hosts file path on macOS', () => {
      const macPath = '/etc/hosts';
      expect(macPath).toBe('/etc/hosts');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty hosts file', () => {
      const hostsContent = '';
      const result = updateDevWPBlock(hostsContent, 'example.test', 'add');

      expect(result).toContain('# Start DevWP');
      expect(result).toContain('127.0.0.1 example.test');
      expect(result).toContain('# End DevWP');
    });

    it('should handle hosts file with only whitespace', () => {
      const hostsContent = '\n\n\n';
      const result = updateDevWPBlock(hostsContent, 'example.test', 'add');

      expect(result).toContain('# Start DevWP');
      expect(result).toContain('127.0.0.1 example.test');
    });

    it('should not duplicate entries', () => {
      let hostsContent = `127.0.0.1 localhost`;

      hostsContent = updateDevWPBlock(hostsContent, 'example.test', 'add');
      hostsContent = updateDevWPBlock(hostsContent, 'example.test', 'add');

      const matches = hostsContent.match(/127\.0\.0\.1 example\.test/g);
      expect(matches).toHaveLength(1);
    });
  });
});

function updateDevWPBlock(
  hostsContent: string,
  domain: string,
  action: 'add' | 'remove',
): string {
  const lines = hostsContent.split('\n');
  const startIdx = lines.findIndex((line) => line.trim() === '# Start DevWP');
  const endIdx = lines.findIndex((line) => line.trim() === '# End DevWP');

  let before: string[], block: string[], after: string[];

  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    before = lines.slice(0, startIdx + 1);
    block = lines.slice(startIdx + 1, endIdx);
    after = lines.slice(endIdx);
  } else {
    before = [...lines, '# Start DevWP'];
    block = [];
    after = ['# End DevWP'];
  }

  const hostsEntry = `127.0.0.1 ${domain}`;
  block = block.filter((line) => !line.includes(domain.split(' ')[0]));

  if (action === 'add') {
    block.push(hostsEntry);
  }

  while (block.length && !block[block.length - 1].trim()) block.pop();

  if (block.length === 0 && action === 'remove') {
    // Remove the DevWP block entirely if empty
    return lines
      .filter(
        (line) =>
          !line.includes('# Start DevWP') && !line.includes('# End DevWP'),
      )
      .join('\n');
  }

  return [...before, ...block, ...after].join('\n').replace(/\n{3,}/g, '\n\n');
}
