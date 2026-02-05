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
                ]
            }
            decision_notes: {
                Row: {
                    body: string
                    created_at: string
                    id: string
                    parent_id: string
                    parent_type: string
                    project_id: string
                    status: string
                    updated_at: string
                }
                Insert: {
                    body: string
                    created_at?: string
                    id?: string
                    parent_id: string
                    parent_type: string
                    project_id: string
                    status?: string
                    updated_at?: string
                }
                Update: {
                    body?: string
                    created_at?: string
                    id?: string
                    parent_id?: string
                    parent_type?: string
                    project_id?: string
                    status?: string
                    updated_at?: string
                }
                Relationships: [
                    {
                        foreignKeyName: "decision_notes_project_id_fkey"
                        columns: ["project_id"]
                        isOneToOne: false
                        referencedRelation: "projects"
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
                    prompt_snippet: string | null
                    reference_images: Json
                    slug: string
                    status: string
                    trigger_token: string | null
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
                    prompt_snippet?: string | null
                    reference_images?: Json
                    slug: string
                    status?: string
                    trigger_token?: string | null
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
                    prompt_snippet?: string | null
                    reference_images?: Json
                    slug?: string
                    status?: string
                    trigger_token?: string | null
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
                    screenplay_file_url: string | null
                    screenplay_text: string | null
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
                    screenplay_file_url?: string | null
                    screenplay_text?: string | null
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
                    screenplay_file_url?: string | null
                    screenplay_text?: string | null
                    status?: string | null
                    title?: string
                    updated_at?: string
                }
                Relationships: []
            }
            scenes: {
                Row: {
                    created_at: string
                    description: string | null
                    id: string
                    order_index: number
                    project_id: string
                    title: string
                    updated_at: string
                }
                Insert: {
                    created_at?: string
                    description?: string | null
                    id?: string
                    order_index?: number
                    project_id: string
                    title: string
                    updated_at?: string
                }
                Update: {
                    created_at?: string
                    description?: string | null
                    id?: string
                    order_index?: number
                    project_id?: string
                    title?: string
                    updated_at?: string
                }
                Relationships: [
                    {
                        foreignKeyName: "scenes_project_id_fkey"
                        columns: ["project_id"]
                        isOneToOne: false
                        referencedRelation: "projects"
                        referencedColumns: ["id"]
                    },
                ]
            }
            shot_entities: {
                Row: {
                    entity_id: string
                    shot_id: string
                }
                Insert: {
                    entity_id: string
                    shot_id: string
                }
                Update: {
                    entity_id?: string
                    shot_id?: string
                }
                Relationships: [
                    {
                        foreignKeyName: "shot_entities_entity_id_fkey"
                        columns: ["entity_id"]
                        isOneToOne: false
                        referencedRelation: "entities"
                        referencedColumns: ["id"]
                    },
                    {
                        foreignKeyName: "shot_entities_shot_id_fkey"
                        columns: ["shot_id"]
                        isOneToOne: false
                        referencedRelation: "shots"
                        referencedColumns: ["id"]
                    },
                ]
            }
            shot_references: {
                Row: {
                    caption: string | null
                    created_at: string
                    id: string
                    order_index: number
                    shot_id: string
                    source: string | null
                    type: string
                }
                Insert: {
                    caption?: string | null
                    created_at?: string
                    id?: string
                    order_index?: number
                    shot_id: string
                    source?: string | null
                    type?: string
                }
                Update: {
                    caption?: string | null
                    created_at?: string
                    id?: string
                    order_index?: number
                    shot_id?: string
                    source?: string | null
                    type?: string
                }
                Relationships: [
                    {
                        foreignKeyName: "shot_references_shot_id_fkey"
                        columns: ["shot_id"]
                        isOneToOne: false
                        referencedRelation: "shots"
                        referencedColumns: ["id"]
                    },
                ]
            }
            shots: {
                Row: {
                    created_at: string
                    id: string
                    order_index: number
                    project_id: string
                    scene_id: string
                    status: string
                    technical_notes: string | null
                    updated_at: string
                    visual_description: string
                }
                Insert: {
                    created_at?: string
                    id?: string
                    order_index?: number
                    project_id: string
                    scene_id: string
                    status?: string
                    technical_notes?: string | null
                    updated_at?: string
                    visual_description: string
                }
                Update: {
                    created_at?: string
                    id?: string
                    order_index?: number
                    project_id?: string
                    scene_id?: string
                    status?: string
                    technical_notes?: string | null
                    updated_at?: string
                    visual_description?: string
                }
                Relationships: [
                    {
                        foreignKeyName: "shots_project_id_fkey"
                        columns: ["project_id"]
                        isOneToOne: false
                        referencedRelation: "projects"
                        referencedColumns: ["id"]
                    },
                    {
                        foreignKeyName: "shots_scene_id_fkey"
                        columns: ["scene_id"]
                        isOneToOne: false
                        referencedRelation: "scenes"
                        referencedColumns: ["id"]
                    },
                ]
            }
            take_nodes: {
                Row: {
                    created_at: string
                    data: Json
                    height: number
                    id: string
                    order_index: number
                    position_x: number
                    position_y: number
                    take_id: string
                    type: string
                    updated_at: string
                    width: number
                }
                Insert: {
                    created_at?: string
                    data?: Json
                    height?: number
                    id?: string
                    order_index?: number
                    position_x?: number
                    position_y?: number
                    take_id: string
                    type?: string
                    updated_at?: string
                    width?: number
                }
                Update: {
                    created_at?: string
                    data?: Json
                    height?: number
                    id?: string
                    order_index?: number
                    position_x?: number
                    position_y?: number
                    take_id?: string
                    type?: string
                    updated_at?: string
                    width?: number
                }
                Relationships: [
                    {
                        foreignKeyName: "take_nodes_take_id_fkey"
                        columns: ["take_id"]
                        isOneToOne: false
                        referencedRelation: "takes"
                        referencedColumns: ["id"]
                    },
                ]
            }
            take_snapshots: {
                Row: {
                    created_at: string
                    created_by: string
                    id: string
                    payload: Json
                    project_id: string
                    reason: string
                    scene_id: string
                    shot_id: string
                    take_id: string
                }
                Insert: {
                    created_at?: string
                    created_by: string
                    id?: string
                    payload: Json
                    project_id: string
                    reason: string
                    scene_id: string
                    shot_id: string
                    take_id: string
                }
                Update: {
                    created_at?: string
                    created_by?: string
                    id?: string
                    payload?: Json
                    project_id?: string
                    reason?: string
                    scene_id?: string
                    shot_id?: string
                    take_id?: string
                }
                Relationships: [
                    {
                        foreignKeyName: "take_snapshots_project_id_fkey"
                        columns: ["project_id"]
                        isOneToOne: false
                        referencedRelation: "projects"
                        referencedColumns: ["id"]
                    },
                    {
                        foreignKeyName: "take_snapshots_scene_id_fkey"
                        columns: ["scene_id"]
                        isOneToOne: false
                        referencedRelation: "scenes"
                        referencedColumns: ["id"]
                    },
                    {
                        foreignKeyName: "take_snapshots_shot_id_fkey"
                        columns: ["shot_id"]
                        isOneToOne: false
                        referencedRelation: "shots"
                        referencedColumns: ["id"]
                    },
                    {
                        foreignKeyName: "take_snapshots_take_id_fkey"
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
                    id: string
                    media_type: string
                    project_id: string
                    prompt_snapshot: string | null
                    shot_id: string | null
                    source: string | null
                    status: string
                    tool_meta: Json | null
                }
                Insert: {
                    created_at?: string
                    id?: string
                    media_type?: string
                    project_id: string
                    prompt_snapshot?: string | null
                    shot_id?: string | null
                    source?: string | null
                    status?: string
                    tool_meta?: Json | null
                }
                Update: {
                    created_at?: string
                    id?: string
                    media_type?: string
                    project_id?: string
                    prompt_snapshot?: string | null
                    shot_id?: string | null
                    source?: string | null
                    status?: string
                    tool_meta?: Json | null
                }
                Relationships: [
                    {
                        foreignKeyName: "takes_project_id_fkey"
                        columns: ["project_id"]
                        isOneToOne: false
                        referencedRelation: "projects"
                        referencedColumns: ["id"]
                    },
                    {
                        foreignKeyName: "takes_shot_id_fkey"
                        columns: ["shot_id"]
                        isOneToOne: false
                        referencedRelation: "shots"
                        referencedColumns: ["id"]
                    },
                ]
            }
        }
        Views: {
            [_ in never]: never
        }
        Functions: {
            archive_board: { Args: { board_id: string }; Returns: Json }
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
