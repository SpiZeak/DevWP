import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { type JSX, useEffect, useState } from 'react';
import Toggle from './ui/Toggle';

function XdebugSwitch(): JSX.Element {
  const [xdebugEnabled, setXdebugEnabled] = useState<boolean>(false);
  const [isToggling, setIsToggling] = useState<boolean>(false);

  useEffect(() => {
    // Get initial Xdebug status
    invoke<boolean>('get_xdebug_status')
      .then((status) => {
        setXdebugEnabled(status);
      })
      .catch((err) => {
        console.error('Error getting Xdebug status:', err);
      });

    let unlisten: UnlistenFn | undefined;

    // Set up listener for status updates
    const setupListener = async () => {
      unlisten = await listen<{
        status: 'restarting' | 'complete' | 'error';
        enabled?: boolean;
        message?: string;
      }>('xdebug-status', (event) => {
        const data = event.payload;
        if (data.status === 'restarting') {
          setIsToggling(true);
        } else if (data.status === 'complete') {
          setXdebugEnabled(data.enabled ?? false);
          setIsToggling(false);
        } else if (data.status === 'error') {
          console.error('Xdebug toggle error:', data.message);
          setIsToggling(false);
        }
      });
    };

    setupListener();

    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, []);

  const handleToggle = async (): Promise<void> => {
    if (isToggling) return;

    setIsToggling(true);
    try {
      await invoke<boolean>('toggle_xdebug');
    } catch (err) {
      console.error('Error toggling Xdebug:', err);
      setIsToggling(false);
    }
  };

  return (
    <div className="flex justify-between items-start mb-6 rounded-md">
      <div className="flex flex-col flex-1 mr-4">
        <div className="flex justify-between items-center mb-2">
          <div className="flex items-center gap-2">
            <span className="text-lg">{xdebugEnabled ? '🐛' : '⚡'}</span>
            <h3 className="m-0 font-medium">
              {xdebugEnabled ? 'Debug' : 'Performance'} mode
            </h3>
          </div>
          <Toggle
            checked={xdebugEnabled}
            onChange={handleToggle}
            disabled={isToggling}
            title={
              xdebugEnabled
                ? 'Switch to Performance Mode'
                : 'Switch to Debug Mode'
            }
          />
        </div>
        <p className="m-0 text-seasalt text-sm leading-relaxed">
          {xdebugEnabled
            ? 'Debug mode enables Xdebug for step debugging and profiling PHP code.'
            : 'Performance mode disables Xdebug for faster PHP execution and activates JIT (Just-In-Time) compilation.'}
        </p>
      </div>
    </div>
  );
}

export default XdebugSwitch;
