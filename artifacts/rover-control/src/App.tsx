import { Redirect, Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/dashboard";
import MainControl from "@/pages/main-control";
import ArmControl from "@/pages/arm-control";
import Settings from "@/pages/settings";
import MapPage from "@/pages/map";
import CamerasPage from "@/pages/cameras";
import RoboticArmOperator from "@/pages/robotic-arm-operator";
import HardwareDiagnostics from "@/pages/hardware-diagnostics";
import { useOperatorRole } from "@/hooks/use-operator-role";

const queryClient = new QueryClient();

function Router() {
  const permissions = useOperatorRole();

  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/classic">
        {permissions.hasRole && permissions.canDrive ? <MainControl /> : <Redirect to="/" />}
      </Route>
      <Route path="/arm">
        {permissions.hasRole && permissions.canArm ? <ArmControl /> : <Redirect to="/" />}
      </Route>
      <Route path="/arm-operator">
        {permissions.hasRole && permissions.canArm ? <RoboticArmOperator /> : <Redirect to="/" />}
      </Route>
      <Route path="/cameras">
        {permissions.hasRole && permissions.canViewCameras ? <CamerasPage /> : <Redirect to="/" />}
      </Route>
      <Route path="/map">
        {permissions.hasRole && permissions.canViewMap ? <MapPage /> : <Redirect to="/" />}
      </Route>
      <Route path="/settings">
        {permissions.hasRole && permissions.canConfigure ? <Settings /> : <Redirect to="/" />}
      </Route>
      <Route path="/diagnostics">
        {permissions.hasRole ? <HardwareDiagnostics /> : <Redirect to="/" />}
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
