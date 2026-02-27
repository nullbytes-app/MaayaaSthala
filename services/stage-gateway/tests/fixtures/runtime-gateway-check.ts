import { startNetworkGateway } from "../../src/networkGateway";

const handle = await startNetworkGateway({ grpcPort: 0, wsPort: 0 });
console.log("gateway-started", handle.grpcPort, handle.wsPort);
await handle.close();
