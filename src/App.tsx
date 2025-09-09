import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { AppSidebar } from "@/components/AppSidebar";
import Gallery from "./pages/Gallery";
import Generate from "./pages/Generate";
import Login from "./pages/Login";
import Register from "./pages/Register";
import NotFound from "./pages/NotFound";
import Upload from "./pages/Upload";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          {/* Auth routes without sidebar */}
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          
          {/* Main app routes with sidebar */}
          <Route path="/*" element={
            <SidebarProvider>
              <div className="min-h-screen flex w-full bg-gallery-bg">
                <AppSidebar />
                <div className="flex-1 flex flex-col">
                  {/* Header with sidebar trigger */}
                  <header className="h-16 flex items-center justify-between border-b border-sidebar-border bg-gallery-card/50 backdrop-blur-sm">
                    <SidebarTrigger className="ml-4" />
                    <div className="ml-4">
                      <h2 className="text-lg font-semibold gradient-text">AI Gallery</h2>
                    </div>
                    <div className="mr-4">
                      <Link to="/upload">
                        <Button size="sm" className="bg-gradient-primary hover:bg-gradient-secondary">Upload</Button>
                      </Link>
                    </div>
                  </header>
                  
                  {/* Main content */}
                  <main className="flex-1 overflow-auto">
                    <Routes>
                      <Route path="/" element={<Gallery />} />
                      <Route path="/generate" element={<Generate />} />
                      <Route path="/my-images" element={<Gallery />} />
                      <Route path="/upload" element={<Upload />} />
                      <Route path="/albums" element={<Gallery />} />
                      <Route path="/favorites" element={<Gallery />} />
                      <Route path="/search" element={<Gallery />} />
                      <Route path="/settings" element={<div className="p-6"><h1 className="text-2xl font-bold">Settings</h1></div>} />
                      <Route path="/profile" element={<div className="p-6"><h1 className="text-2xl font-bold">Profile</h1></div>} />
                      <Route path="*" element={<NotFound />} />
                    </Routes>
                  </main>
                </div>
              </div>
            </SidebarProvider>
          } />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
