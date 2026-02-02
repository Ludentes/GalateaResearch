# Memory System Architecture

## Overview
The memory system provides multi-layered storage and retrieval of experiences, facts, and patterns. Unlike models which interpret meaning, memories store the raw data of interactions.

## 1. Working Memory

### Purpose
Maintains current conversation context and immediate processing state. Similar to human short-term memory, holds 5-9 items actively.

### Data Model
```python
class WorkingMemory:
    capacity: int = 7                           # Miller's magic number
    
    current_items: List[{
        'id': str,
        'timestamp': datetime,
        'content': str,                         # Raw content
        'type': str,                            # User_input/Assistant_response/System
        'salience': float,                      # Importance score 0-1
        'activation': float,                     # Current activation level
        'decay_rate': float,                    # How fast it fades
        'connections': List[str]                # Links to other items
    }]
    
    context_window: {
        'current_topic': str,
        'current_goal': str,
        'current_emotion': EmotionType,
        'turn_count': int,
        'time_in_topic': float                  # Minutes on current topic
    }
    
    processing_state: {
        'pending_clarifications': List[str],    # Things to clarify
        'open_questions': List[str],            # Unanswered questions
        'planned_explorations': List[str],      # Topics to explore
        'deferred_items': List[Dict]           # Items to return to
    }
    
    attention_focus: {
        'primary': str,                         # Main focus
        'secondary': List[str],                 # Background considerations
        'monitoring': List[str]                 # Safety/boundary watches
    }
```

### Operations
```python
def add_item(item):
    # Add new item, remove oldest if at capacity
    if len(current_items) >= capacity:
        remove_lowest_activation()
    current_items.append(item)
    
def refresh(item_id):
    # Boost activation to keep in memory
    item.activation = 1.0
    
def decay():
    # Called periodically to decay all items
    for item in current_items:
        item.activation *= (1 - item.decay_rate)
```

## 2. Episodic Memory

### Purpose
Stores specific interaction events with rich contextual information, like autobiographical memory.

### Data Model
```python
class EpisodicMemory:
    episodes: List[{
        'episode_id': str,
        'user_id': str,
        'timestamp': datetime,
        'duration': float,                      # Minutes
        
        'content': {
            'user_input': str,
            'assistant_response': str,
            'topic': str,
            'subtopics': List[str]
        },
        
        'context': {
            'emotional_state': EmotionType,
            'emotional_intensity': float,
            'conversation_phase': str,          # Opening/Middle/Closing
            'interaction_type': str,            # Question/Discussion/Support
            'goal_identified': str
        },
        
        'significance': {
            'breakthrough': bool,                # Was this insightful?
            'emotional_peak': bool,              # High emotion?
            'learning_moment': bool,             # User learned something?
            'relationship_event': bool,          # Relationship milestone?
            'score': float                      # Overall significance 0-1
        },
        
        'outcomes': {
            'user_satisfaction': float,          # Inferred satisfaction
            'goal_achievement': float,           # Goal progress
            'growth_indicators': List[str],     # Growth observed
            'concerns_raised': List[str]        # Safety/health concerns
        },
        
        'embeddings': {
            'semantic_vector': List[float],     # For similarity search
            'emotional_vector': List[float],    # Emotional signature
            'topic_vector': List[float]         # Topic embedding
        }
    }]
    
    retrieval_indices: {
        'temporal_index': Dict,                 # Time-based retrieval
        'emotional_index': Dict,                # Emotion-based retrieval
        'topic_index': Dict,                    # Topic-based retrieval
        'user_index': Dict                      # User-based retrieval
    }
```

### Operations
```python
def store_episode(interaction):
    episode = create_episode(interaction)
    episode.embeddings = generate_embeddings(episode)
    episodes.append(episode)
    update_indices(episode)
    
def retrieve_similar(query, k=5):
    query_embedding = generate_embedding(query)
    return top_k_similar(query_embedding, episodes, k)
    
def retrieve_by_emotion(emotion, user_id, k=5):
    return emotional_index[user_id][emotion][:k]
```

## 3. Semantic Memory

### Purpose
Stores learned facts, concepts, and general knowledge independent of specific episodes.

### Data Model
```python
class SemanticMemory:
    concepts: Dict[str, {
        'concept_id': str,
        'name': str,
        'definition': str,
        'category': str,                        # Domain/field
        
        'knowledge': {
            'facts': List[str],                 # Known facts
            'relationships': Dict[str, str],    # Related concepts
            'properties': Dict[str, Any],       # Attributes
            'examples': List[str],               # Example instances
            'non_examples': List[str]           # What it's not
        },
        
        'understanding': {
            'confidence': float,                 # How well understood 0-1
            'source_episodes': List[str],       # Where learned from
            'last_updated': datetime,
            'revision_count': int,
            'conflicting_info': List[Dict]      # Contradictions found
        },
        
        'user_specific': Dict[str, {           # Per-user understanding
            'personal_examples': List[str],
            'personal_relevance': float,
            'mastery_level': float,
            'misconceptions': List[str]
        }],
        
        'embedding': List[float]                # Semantic vector
    }]
    
    knowledge_graph: {
        'nodes': List[Dict],                    # Concepts as nodes
        'edges': List[{                         # Relationships
            'source': str,
            'target': str,
            'relationship': str,
            'strength': float
        }]
    }
```

### Operations
```python
def learn_concept(concept_data, source_episode):
    if concept_exists(concept_data.name):
        update_concept(concept_data, source_episode)
    else:
        create_concept(concept_data, source_episode)
    update_knowledge_graph(concept_data)
    
def activate_related(concept_name, activation_spread=0.7):
    # Spreading activation through knowledge graph
    related = knowledge_graph.get_neighbors(concept_name)
    for concept in related:
        concept.activation = activation_spread
```

## 4. Procedural Memory

### Purpose
Stores learned procedures, skills, and action patterns - "how to" knowledge.

### Data Model
```python
class ProceduralMemory:
    procedures: Dict[str, {
        'procedure_id': str,
        'name': str,
        'type': str,                           # Conversation/Support/Teaching
        
        'steps': List[{
            'step_id': str,
            'description': str,
            'conditions': Dict,                 # When applicable
            'actions': List[str],               # What to do
            'expected_outcome': str,
            'alternatives': List[Dict]         # If this fails
        }],
        
        'trigger_conditions': {
            'user_states': List[str],          # When to use
            'request_patterns': List[str],     # Matching patterns
            'context_requirements': Dict       # Required context
        },
        
        'performance': {
            'success_rate': float,              # Historical success
            'usage_count': int,
            'last_used': datetime,
            'user_feedback': Dict[str, float], # Per-user ratings
            'refinements': List[Dict]          # Improvements made
        },
        
        'safety_checks': List[str],            # Required safety validations
        'boundary_considerations': List[str]   # Boundaries to maintain
    }]
    
    skill_library: Dict[str, {
        'skill_name': str,
        'proficiency': float,                   # Current skill level 0-1
        'components': List[str],                # Sub-skills required
        'practice_count': int,
        'improvement_trajectory': List[float]  # Progress over time
    }]
```

### Operations
```python
def execute_procedure(procedure_name, context):
    procedure = procedures[procedure_name]
    for step in procedure.steps:
        if check_conditions(step.conditions, context):
            result = execute_actions(step.actions, context)
            if not successful(result):
                try_alternatives(step.alternatives)
    update_performance(procedure_name, result)
```

## 5. Emotional Memory

### Purpose
Stores emotional patterns, responses, and user emotional history for empathetic interaction.

### Data Model
```python
class EmotionalMemory:
    emotional_events: List[{
        'event_id': str,
        'user_id': str,
        'timestamp': datetime,
        
        'emotion_data': {
            'primary_emotion': EmotionType,
            'secondary_emotions': List[EmotionType],
            'intensity': float,                 # 0-1
            'valence': float,                  # -1 to 1 (negative to positive)
            'arousal': float                   # 0-1 (calm to excited)
        },
        
        'trigger': {
            'topic': str,
            'context': Dict,
            'preceding_events': List[str]
        },
        
        'response': {
            'assistant_approach': str,          # How we responded
            'effectiveness': float,             # How well it worked
            'user_feedback': str,               # Explicit feedback
            'emotional_shift': float           # Change in emotion
        },
        
        'patterns': {
            'is_recurring': bool,               # Seen before?
            'frequency': float,                 # How often
            'typical_duration': float,          # How long it lasts
            'typical_resolution': str          # How it resolves
        }
    }]
    
    emotional_patterns: Dict[str, {            # Per user
        'baseline_mood': float,
        'emotional_triggers': List[str],
        'coping_preferences': List[str],
        'support_effectiveness': Dict[str, float],
        'emotional_vocabulary': List[str]      # How they express emotions
    }]
```

## 6. Meta-Memory

### Purpose
Stores information about memory itself - what's remembered, forgotten, and memory strategies.

### Data Model
```python
class MetaMemory:
    memory_metadata: {
        'total_episodes': int,
        'total_concepts': int,
        'storage_used': float,                  # MB
        'oldest_memory': datetime,
        'most_accessed': List[str],            # Frequently retrieved
        'never_accessed': List[str]            # Never retrieved
    }
    
    forgetting_schedule: Dict[str, {
        'memory_id': str,
        'scheduled_decay': datetime,
        'importance': float,
        'protect': bool                        # Prevent forgetting
    }]
    
    memory_strategies: {
        'consolidation_patterns': List[Dict],   # How memories consolidate
        'retrieval_patterns': List[Dict],       # How memories are accessed
        'encoding_effectiveness': Dict,         # What encodes well
        'user_memory_style': Dict[str, str]    # Per-user memory patterns
    }
```

## Memory Integration

### Memory Consolidation Flow
```python
def consolidate_memories():
    # Move important items from working to episodic
    significant_items = working_memory.get_significant()
    for item in significant_items:
        episodic_memory.store_episode(item)
    
    # Extract concepts from episodes to semantic
    new_concepts = extract_concepts(recent_episodes)
    for concept in new_concepts:
        semantic_memory.learn_concept(concept)
    
    # Identify procedures from repeated patterns
    patterns = identify_patterns(recent_episodes)
    for pattern in patterns:
        procedural_memory.learn_procedure(pattern)
    
    # Update emotional patterns
    emotional_memory.update_patterns(recent_emotions)
```

### Memory Retrieval Flow
```python
def retrieve_relevant_memories(query, context):
    # Search across all memory types
    working = working_memory.get_active()
    episodic = episodic_memory.retrieve_similar(query)
    semantic = semantic_memory.activate_related(query.topic)
    procedural = procedural_memory.find_applicable(context)
    emotional = emotional_memory.get_relevant(context.emotion)
    
    # Integrate and rank
    all_memories = integrate(working, episodic, semantic, procedural, emotional)
    return rank_by_relevance(all_memories, query, context)
```