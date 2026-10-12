import { describe, it, expect } from "vitest";
import { TabLeaderCoordinator } from "../tabCoordinator";
import { OfflineSyncEngine } from "../offlineQueue";

describe("TabLeaderCoordinator (Single-Leader Multi-Tab Election & Failover)", () => {
  it("elects the first tab as mainLogicWindow leader and keeps subsequent tabs as followers", async () => {
    const lockName = `test_lock_${Date.now()}_1`;
    const channelName = `test_chan_${Date.now()}_1`;

    const tab1 = new TabLeaderCoordinator({
      tabId: "tab_1",
      lockName,
      channelName,
      useWebLocks: false,
    });
    const tab2 = new TabLeaderCoordinator({
      tabId: "tab_2",
      lockName,
      channelName,
      useWebLocks: false,
    });

    await tab1.start();
    await tab2.start();

    expect(tab1.isMainLogicWindow()).toBe(true);
    expect(tab2.isMainLogicWindow()).toBe(false);
    expect(tab1.getLeaderTabId()).toBe("tab_1");
    expect(tab2.getLeaderTabId()).toBe("tab_1");

    tab1.stop();
    tab2.stop();
  });

  it("automatically promotes the next follower tab on leader stop() and notifies leadership listeners", async () => {
    const lockName = `test_lock_${Date.now()}_2`;
    const channelName = `test_chan_${Date.now()}_2`;

    const engine1 = new OfflineSyncEngine({ isMainLogicWindow: false });
    const engine2 = new OfflineSyncEngine({ isMainLogicWindow: false });

    const tab1 = new TabLeaderCoordinator({
      tabId: "tab_leader_1",
      lockName,
      channelName,
      engine: engine1,
      useWebLocks: false,
    });
    const tab2 = new TabLeaderCoordinator({
      tabId: "tab_follower_2",
      lockName,
      channelName,
      engine: engine2,
      useWebLocks: false,
    });

    const tab2LeadershipHistory: boolean[] = [];
    tab2.onLeadershipChange((isLeader) => {
      tab2LeadershipHistory.push(isLeader);
    });

    await tab1.start();
    await tab2.start();

    expect(tab1.isMainLogicWindow()).toBe(true);
    expect(tab2.isMainLogicWindow()).toBe(false);

    // Al cerrar la pestaña líder, tab2 adquiere automáticamente el rol de mainLogicWindow
    tab1.stop();

    expect(tab1.isMainLogicWindow()).toBe(false);
    expect(tab2.isMainLogicWindow()).toBe(true);
    expect(tab2.getLeaderTabId()).toBe("tab_follower_2");
    expect(tab2LeadershipHistory).toContain(true);

    tab2.stop();
  });

  it("validates sender authorization via isAuthorizedSender (zi(e) guard)", async () => {
    const lockName = `test_lock_${Date.now()}_3`;
    const channelName = `test_chan_${Date.now()}_3`;

    const leaderTab = new TabLeaderCoordinator({
      tabId: "tab_auth_leader",
      lockName,
      channelName,
      useWebLocks: false,
    });
    const followerTab = new TabLeaderCoordinator({
      tabId: "tab_auth_follower",
      lockName,
      channelName,
      useWebLocks: false,
    });

    await leaderTab.start();
    await followerTab.start();

    expect(
      followerTab.isAuthorizedSender({ senderTabId: "tab_auth_leader" })
    ).toBe(true);
    expect(
      followerTab.isAuthorizedSender({ senderTabId: "tab_auth_follower" })
    ).toBe(false);
    expect(
      followerTab.isAuthorizedSender({ senderTabId: "tab_rogue_spoof" })
    ).toBe(false);
    expect(followerTab.isAuthorizedSender({})).toBe(false);

    leaderTab.stop();
    followerTab.stop();
  });
});
