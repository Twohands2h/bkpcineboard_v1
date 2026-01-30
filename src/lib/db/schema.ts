export type Json =
    | string
    | number
    | boolean
    | null
    | { [key: string]: Json | undefined }
    | Json[]

export type Database = {
    // Allows to automatically instantiate createClient with right options
    // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
    __InternalSupabase: {
        PostgrestVersion: "14.1"
    }
    public: {
        Tables: {
            board_derivations: {
                Row: {
                    board_id: string
                    created_at: string
                    ended_at: string | null
                    fork_note: string | null
                    forked_at: string
                    id: string
                    source_board_id: string
                    status: string
                }
                Insert: {
                    board_id: string
                    created_at?: string
                    ended_at?: string | null
                    fork_note?: string | null
                    forked_at?: string
                    id?: string
                    source_board_id: string
                    status?: string
                }
                Update: {
                    board_id?: string
                    created_at?: string
                    ended_at?: string | null
                    fork_note?: string | null
                    forked_at?: string
                    id?: string
                    source_board_id?: string
                    status?: string
                }
                Relationships: [
                    {
                        foreignKeyName: "board_derivations_board_id_fkey"
                        columns: ["board_id"]
                        isOneToOne: false
                        referencedRelation: "boards"
                        referencedColumns: ["id"]
                    },
                    {
                        foreignKeyName: "board_derivations_source_board_id_fkey"
                        columns: ["source_board_id"]
                        isOneToOne: false
                        referencedRelation: "boards"
                        referencedColumns: ["id"]
                    },
                ]
            }
            board_links: {
                Row: {
                    board_id: string
                    created_at: string
                    ended_at: string | null
                    id: string
                    link_type: string
                    status: string
                    target_id: string
                    target_type: string
                }
                Insert: {
                    board_id: string
                    created_at?: string
                    ended_at?: string | null
                    id?: string
                    link_type: string
                    status?: string
                    target_id: string
                    target_type: string
                }
                Update: {
                    board_id?: string
                    created_at?: string
                    ended_at?: string | null
                    id?: string
                    link_type?: string
                    status?: string
                    target_id?: string
                    target_type?: string
                }
                Relationships: [
                    {
                        foreignKeyName: "board_links_board_id_fkey"
                        columns: ["board_id"]
                        isOneToOne: false
                        referencedRelation: "boards"
                        referencedColumns: ["id"]
                    },
                ]
            }
            board_nodes: {
                Row: {
                    board_id: string
                    content: Json
                    content_updated_at: string
                    created_at: string
                    created_by: string | null
                    height: number | null
                    id: string
                    node_type: string
                    order_index: number
                    parent_id: string | null
                    position_x: number
                    position_y: number
                    previous_version: string | null
                    status: string
                    superseded_by: string | null
                    updated_at: string
                    version: number
                    width: number | null
                }
                Insert: {
                    board_id: string
                    content?: Json
                    content_updated_at?: string
                    created_at?: string
                    created_by?: string | null
                    height?: number | null
                    id?: string
                    node_type: string
                    order_index?: number
                    parent_id?: string | null
                    position_x?: number
                    position_y?: number
                    previous_version?: string | null
                    status?: string
                    superseded_by?: string | null
                    updated_at?: string
                    version?: number
                    width?: number | null
                }
                Update: {
                    board_id?: string
                    content?: Json
                    content_updated_at?: string
                    created_at?: string
                    created_by?: string | null
                    height?: number | null
                    id?: string
                    node_type?: string
                    order_index?: number
                    parent_id?: string | null
                    position_x?: number
                    position_y?: number
                    previous_version?: string | null
                    status?: string
                    superseded_by?: string | null
                    updated_at?: string
                    version?: number
                    width?: number | null
                }
                Relationships: [
                    {
                        foreignKeyName: "board_nodes_board_id_fkey"
                        columns: ["board_id"]
                        isOneToOne: false
                        referencedRelation: "boards"
                        referencedColumns: ["id"]
                    },
                    {
                        foreignKeyName: "board_nodes_parent_id_fkey"
                        columns: ["parent_id"]
                        isOneToOne: false
                        referencedRelation: "board_nodes"
                        referencedColumns: ["id"]
                    },
                    {
                        foreignKeyName: "board_nodes_previous_version_fkey"
                        columns: ["previous_version"]
                        isOneToOne: false
                        referencedRelation: "board_nodes"
                        referencedColumns: ["id"]
                    },
                    {
                        foreignKeyName: "board_nodes_superseded_by_fkey"
                        columns: ["superseded_by"]
                        isOneToOne: false
                        referencedRelation: "board_nodes"
                        referencedColumns: ["id"]
                    },
                ]
            }
            boards: {
                Row: {
                    canvas_state: Json | null
                    created_at: string
                    description: string | null
                    id: string
                    project_id: string
                    status: string
                    template_id: string | null
                    title: string
                    updated_at: string
                }
                Insert: {
                    canvas_state?: Json | null
                    created_at?: string
                    description?: string | null
                    id?: string
                    project_id: string
                    status?: string
                    template_id?: string | null
                    title: string
                    updated_at?: string
                }
                Update: {
                    canvas_state?: Json | null
                    created_at?: string
                    description?: string | null
                    id?: string
                    project_id?: string
                    status?: string
                    template_id?: string | null
                    title?: string
                    updated_at?: string
                }
                Relationships: [
                    {
                        foreignKeyName: "boards_project_id_fkey"
                        columns: ["project_id"]
                        isOneToOne: false
                        referencedRelation: "projects"
                        referencedColumns: ["id"]
                    },
                    {
                        foreignKeyName: "boards_template_id_fkey"
                        columns: ["template_id"]
                        isOneToOne: false
                        referencedRelation: "templates"
                        referencedColumns: ["id"]
                    },
                ]
            }
            entities: {
                Row: {
                    created_at: string
                    description: string | null
                    id: string
                    master_prompt: string | null
                    name: string
                    order_index: number | null
                    project_id: string
                    reference_images: Json
                    slug: string
                    type: string
                    updated_at: string
                }
                Insert: {
                    created_at?: string
                    description?: string | null
                    id?: string
                    master_prompt?: string | null
                    name: string
                    order_index?: number | null
                    project_id: string
                    reference_images?: Json
                    slug: string
                    type: string
                    updated_at?: string
                }
                Update: {
                    created_at?: string
                    description?: string | null
                    id?: string
                    master_prompt?: string | null
                    name?: string
                    order_index?: number | null
                    project_id?: string
                    reference_images?: Json
                    slug?: string
                    type?: string
                    updated_at?: string
                }
                Relationships: [
                    {
                        foreignKeyName: "entities_project_id_fkey"
                        columns: ["project_id"]
                        isOneToOne: false
                        referencedRelation: "projects"
                        referencedColumns: ["id"]
                    },
                ]
            }
            projects: {
                Row: {
                    created_at: string
                    duration_seconds: number | null
                    id: string
                    logline: string | null
                    owner_id: string | null
                    status: string | null
                    title: string
                    updated_at: string
                }
                Insert: {
                    created_at?: string
                    duration_seconds?: number | null
                    id?: string
                    logline?: string | null
                    owner_id?: string | null
                    status?: string | null
                    title: string
                    updated_at?: string
                }
                Update: {
                    created_at?: string
                    duration_seconds?: number | null
                    id?: string
                    logline?: string | null
                    owner_id?: string | null
                    status?: string | null
                    title?: string
                    updated_at?: string
                }
                Relationships: []
            }
            shotlists: {
                Row: {
                    created_at: string
                    description: string | null
                    id: string
                    project_id: string
                    title: string
                    updated_at: string
                }
                Insert: {
                    created_at?: string
                    description?: string | null
                    id?: string
                    project_id: string
                    title?: string
                    updated_at?: string
                }
                Update: {
                    created_at?: string
                    description?: string | null
                    id?: string
                    project_id?: string
                    title?: string
                    updated_at?: string
                }
                Relationships: [
                    {
                        foreignKeyName: "shotlists_project_id_fkey"
                        columns: ["project_id"]
                        isOneToOne: false
                        referencedRelation: "projects"
                        referencedColumns: ["id"]
                    },
                ]
            }
            shots: {
                Row: {
                    board_id: string | null
                    created_at: string
                    description: string | null
                    entity_references: Json
                    id: string
                    order_index: number
                    shot_number: string
                    shot_type: string | null
                    shotlist_id: string
                    status: string
                    title: string | null
                    updated_at: string
                }
                Insert: {
                    board_id?: string | null
                    created_at?: string
                    description?: string | null
                    entity_references?: Json
                    id?: string
                    order_index?: number
                    shot_number?: string
                    shot_type?: string | null
                    shotlist_id: string
                    status?: string
                    title?: string | null
                    updated_at?: string
                }
                Update: {
                    board_id?: string | null
                    created_at?: string
                    description?: string | null
                    entity_references?: Json
                    id?: string
                    order_index?: number
                    shot_number?: string
                    shot_type?: string | null
                    shotlist_id?: string
                    status?: string
                    title?: string | null
                    updated_at?: string
                }
                Relationships: [
                    {
                        foreignKeyName: "shots_shotlist_id_fkey"
                        columns: ["shotlist_id"]
                        isOneToOne: false
                        referencedRelation: "shotlists"
                        referencedColumns: ["id"]
                    },
                ]
            }
            take_items: {
                Row: {
                    board_node_id: string
                    created_at: string
                    id: string
                    metadata: Json | null
                    order_index: number
                    take_id: string
                }
                Insert: {
                    board_node_id: string
                    created_at?: string
                    id?: string
                    metadata?: Json | null
                    order_index?: number
                    take_id: string
                }
                Update: {
                    board_node_id?: string
                    created_at?: string
                    id?: string
                    metadata?: Json | null
                    order_index?: number
                    take_id?: string
                }
                Relationships: [
                    {
                        foreignKeyName: "take_items_board_node_id_fkey"
                        columns: ["board_node_id"]
                        isOneToOne: false
                        referencedRelation: "board_nodes"
                        referencedColumns: ["id"]
                    },
                    {
                        foreignKeyName: "take_items_take_id_fkey"
                        columns: ["take_id"]
                        isOneToOne: false
                        referencedRelation: "takes"
                        referencedColumns: ["id"]
                    },
                ]
            }
            takes: {
                Row: {
                    created_at: string
                    description: string | null
                    id: string
                    name: string
                    order_index: number
                    shot_id: string
                    status: string
                    updated_at: string
                }
                Insert: {
                    created_at?: string
                    description?: string | null
                    id?: string
                    name: string
                    order_index?: number
                    shot_id: string
                    status?: string
                    updated_at?: string
                }
                Update: {
                    created_at?: string
                    description?: string | null
                    id?: string
                    name?: string
                    order_index?: number
                    shot_id?: string
                    status?: string
                    updated_at?: string
                }
                Relationships: [
                    {
                        foreignKeyName: "takes_shot_id_fkey"
                        columns: ["shot_id"]
                        isOneToOne: false
                        referencedRelation: "shots"
                        referencedColumns: ["id"]
                    },
                ]
            }
            templates: {
                Row: {
                    created_at: string
                    description: string | null
                    id: string
                    name: string
                    project_id: string | null
                    status: string
                    structure: Json
                    template_type: string | null
                    updated_at: string
                    user_id: string | null
                }
                Insert: {
                    created_at?: string
                    description?: string | null
                    id?: string
                    name: string
                    project_id?: string | null
                    status?: string
                    structure?: Json
                    template_type?: string | null
                    updated_at?: string
                    user_id?: string | null
                }
                Update: {
                    created_at?: string
                    description?: string | null
                    id?: string
                    name?: string
                    project_id?: string | null
                    status?: string
                    structure?: Json
                    template_type?: string | null
                    updated_at?: string
                    user_id?: string | null
                }
                Relationships: [
                    {
                        foreignKeyName: "templates_project_id_fkey"
                        columns: ["project_id"]
                        isOneToOne: false
                        referencedRelation: "projects"
                        referencedColumns: ["id"]
                    },
                ]
            }
        }
        Views: {
            [_ in never]: never
        }
        Functions: {
            [_ in never]: never
        }
        Enums: {
            [_ in never]: never
        }
        CompositeTypes: {
            [_ in never]: never
        }
    }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
    DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
    TableName extends DefaultSchemaTableNameOrOptions extends {
        schema: keyof DatabaseWithoutInternals
    }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
}
    ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
            Row: infer R
        }
    ? R
    : never
    : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
            Row: infer R
        }
    ? R
    : never
    : never

export type TablesInsert<
    DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
    TableName extends DefaultSchemaTableNameOrOptions extends {
        schema: keyof DatabaseWithoutInternals
    }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
}
    ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
        Insert: infer I
    }
    ? I
    : never
    : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
    }
    ? I
    : never
    : never

export type TablesUpdate<
    DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
    TableName extends DefaultSchemaTableNameOrOptions extends {
        schema: keyof DatabaseWithoutInternals
    }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
}
    ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
        Update: infer U
    }
    ? U
    : never
    : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
    }
    ? U
    : never
    : never

export type Enums<
    DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
    EnumName extends DefaultSchemaEnumNameOrOptions extends {
        schema: keyof DatabaseWithoutInternals
    }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
}
    ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
    : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
    PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
    CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
        schema: keyof DatabaseWithoutInternals
    }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
}
    ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
    : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
    public: {
        Enums: {},
    },
} as const
