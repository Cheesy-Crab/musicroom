// 服务端时间权威:offset = serverTime - clientTime
// 由 socket ping/pong 往返校准(见 store/room.ts)
export const clock = {
  offset: 0,
};

export function serverNow(): number {
  return Date.now() + clock.offset;
}
