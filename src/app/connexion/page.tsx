import { Card, CardTitle } from "@/components/ui";
import { LoginForm } from "./LoginForm";

export default function LoginPage() {
  return (
    <div className="mx-auto max-w-sm pt-12">
      <Card>
        <CardTitle hint="Accès réservé à l'équipe.">Connexion</CardTitle>
        <LoginForm />
      </Card>
    </div>
  );
}
