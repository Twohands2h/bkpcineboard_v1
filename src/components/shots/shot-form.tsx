import { Database } from '@/lib/db/schema'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'

type Shot = Database['public']['Tables']['shots']['Row']

interface ShotFormProps {
  shot?: Shot
  onSubmit?: (formData: FormData) => void
}

export function ShotForm({ shot, onSubmit }: ShotFormProps) {
  return (
    <form 
      onSubmit={(e) => {
        e.preventDefault()
        if (onSubmit) {
          const formData = new FormData(e.currentTarget)
          onSubmit(formData)
        }
      }}
      className="space-y-6"
    >
      <div className="space-y-2">
        <Label htmlFor="visual_description">
          Visual Description *
        </Label>
        <Textarea
          id="visual_description"
          name="visual_description"
          defaultValue={shot?.visual_description || ''}
          placeholder="Describe what happens in this shot..."
          rows={4}
          required
        />
        <p className="text-sm text-gray-500">
          Main description of the shot's visual content
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="technical_notes">
          Technical Notes
        </Label>
        <Textarea
          id="technical_notes"
          name="technical_notes"
          defaultValue={shot?.technical_notes || ''}
          placeholder="Camera movements, lighting notes, etc..."
          rows={3}
        />
        <p className="text-sm text-gray-500">
          Technical execution details (optional)
        </p>
      </div>

      <div className="flex gap-3">
        <Button type="submit">
          {shot ? 'Update Shot' : 'Create Shot'}
        </Button>
        <Button type="button" variant="outline">
          Cancel
        </Button>
      </div>
    </form>
  )
}
