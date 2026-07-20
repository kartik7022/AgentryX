import { createContext, useContext, useEffect, useState } from "react";
import { io } from "socket.io-client";
import { env } from "../config/env";

const BillingEventsContext = createContext({
  connected: false,
  events: [],
  lastEvent: null,
});

export function BillingEventsProvider({ children }) {
  const [events, setEvents] = useState([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const socket = io(env.killbillGatewayUrl);

    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));
    socket.on("billing_event", (event) => {
      setEvents((current) => [event, ...current].slice(0, 50));
    });

    return () => socket.disconnect();
  }, []);

  return (
    <BillingEventsContext.Provider
      value={{
        connected,
        events,
        lastEvent: events[0] || null,
      }}
    >
      {children}
    </BillingEventsContext.Provider>
  );
}

export function useBillingEvents() {
  return useContext(BillingEventsContext);
}
