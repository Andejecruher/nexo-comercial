import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { startExclusiveInterval } from '../../utils/exclusive-interval';

describe('startExclusiveInterval', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('skips ticks while the previous run is in flight', async () => {
    jest.useFakeTimers();
    let release!: () => void;
    const run = jest.fn<() => Promise<void>>().mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const onError = jest.fn();

    const handle = startExclusiveInterval(run, 100, onError);
    jest.advanceTimersByTime(100);
    expect(run).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(300);
    expect(run).toHaveBeenCalledTimes(1);

    release();
    await jest.advanceTimersByTimeAsync(100);
    expect(run).toHaveBeenCalledTimes(2);
    expect(onError).not.toHaveBeenCalled();

    clearInterval(handle);
  });

  it('reports errors without leaving the lock stuck', async () => {
    jest.useFakeTimers();
    const run = jest
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValue(undefined);
    const onError = jest.fn();

    const handle = startExclusiveInterval(run, 50, onError);
    jest.advanceTimersByTime(50);
    await jest.advanceTimersByTimeAsync(50);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledTimes(2);

    clearInterval(handle);
  });
});
