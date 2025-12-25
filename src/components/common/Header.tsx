"use client";

import { LayoutDashboard, LogOut } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { auth } from "@/lib/firebase/clientApp";
import { signOut } from "firebase/auth";

export default function Header() {
  const { isAdmin, isFullyAuthenticated, user } = useAuth();
  const pathname = usePathname();
  const { toast } = useToast();

  const handleLogout = async () => {
    try {
      await signOut(auth);
      toast({
        title: "Logout bem-sucedido!",
        description: "Você foi desconectado.",
      });
    } catch {
      toast({
        variant: "destructive",
        title: "Erro no Logout",
        description: "Não foi possível fazer o logout. Tente novamente.",
      });
    }
  };

  const getInitials = (email: string) => {
    if (!email) return "?";
    return email[0].toUpperCase();
  };

  return (
    <header className="fixed top-0 left-0 w-full bg-background/95 p-4 shadow-sm z-10 backdrop-blur">
      <div className="container mx-auto flex justify-between items-center">
        <Link href="/" className="text-2xl font-bold text-primary">
          Entrada Facilitada
        </Link>

        <div className="flex justify-end items-center gap-4">
          <ThemeToggle />
          {isFullyAuthenticated && (
            <>
              {isAdmin && (
                <Button
                  variant={pathname.startsWith("/admin") ? "secondary" : "ghost"}
                  asChild
                >
                  <Link href="/admin/properties">
                    <LayoutDashboard className="mr-2 h-4 w-4" />
                    Admin
                  </Link>
                </Button>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    className="relative h-10 w-10 rounded-full"
                  >
                    <Avatar className="h-10 w-10">
                      <AvatarImage
                        src={user?.photoURL || ""}
                        alt={user?.displayName || "Avatar"}
                      />
                      <AvatarFallback>{getInitials(user?.email || "")}</AvatarFallback>
                    </Avatar>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56" align="end" forceMount>
                  <DropdownMenuLabel className="font-normal">
                    <div className="flex flex-col space-y-1">
                      <p className="text-sm font-medium leading-none">
                        Minha Conta
                      </p>
                      <p className="text-xs leading-none text-muted-foreground">
                        {user?.email}
                      </p>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleLogout}>
                    <LogOut className="mr-2 h-4 w-4" />
                    <span>Sair</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
