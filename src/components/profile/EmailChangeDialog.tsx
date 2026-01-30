import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Mail, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface EmailChangeDialogProps {
  open: boolean;
  onClose: () => void;
  currentEmail: string;
}

export function EmailChangeDialog({ open, onClose, currentEmail }: EmailChangeDialogProps) {
  const [newEmail, setNewEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!newEmail.trim()) {
      toast({ variant: 'destructive', title: 'Digite o novo email' });
      return;
    }

    if (newEmail.toLowerCase() === currentEmail.toLowerCase()) {
      toast({ variant: 'destructive', title: 'O novo email deve ser diferente do atual' });
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ email: newEmail });
      
      if (error) throw error;
      
      setSuccess(true);
    } catch (error: any) {
      toast({ 
        variant: 'destructive', 
        title: 'Erro ao alterar email',
        description: error.message 
      });
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setNewEmail('');
    setSuccess(false);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Alterar Email
          </DialogTitle>
        </DialogHeader>
        
        {success ? (
          <div className="py-4 space-y-4">
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Enviamos um link de confirmação para <strong>{newEmail}</strong>. 
                Verifique sua caixa de entrada para confirmar a alteração.
              </AlertDescription>
            </Alert>
            <Button onClick={handleClose} className="w-full">
              Entendi
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label className="text-sm text-muted-foreground">Email atual</Label>
              <p className="text-sm font-medium mt-1">{currentEmail}</p>
            </div>
            
            <div>
              <Label htmlFor="newEmail">Novo email</Label>
              <Input
                id="newEmail"
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="Digite o novo email"
                className="mt-1.5"
              />
            </div>

            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={handleClose} className="flex-1">
                Cancelar
              </Button>
              <Button 
                type="submit" 
                disabled={loading}
                className="flex-1 bg-accent text-accent-foreground hover:bg-accent/90"
              >
                {loading ? 'Enviando...' : 'Confirmar'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
