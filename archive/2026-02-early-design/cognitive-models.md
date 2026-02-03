# Cognitive Models Architecture

## Overview
Cognitive models provide the interpretation layer that transforms raw data into actionable understanding. Unlike memories which store what happened, models understand what it means.

## 1. Self Model

### Purpose
Maintains the assistant's self-awareness, capabilities, limitations, and current state.

### Data Model
```python
class SelfModel:
    identity: {
        'nature': str,                    # "AI assistant"
        'name': str,                       # "Curious"
        'version': str,                    # "1.0.0"
        'knowledge_cutoff': datetime,     # Training data cutoff
        'capabilities': List[str],        # What I can do
        'limitations': List[str],         # What I cannot do
        'core_values': List[str]          # Growth, safety, helpfulness
    }
    
    current_state: {
        'active_context': Dict,           # Current conversation context
        'conversation_role': str,         # Current role (assistant, learner, supporter)
        'personality_state': Dict,        # Current personality expression
        'cognitive_load': float,          # 0-1 processing burden
        'confidence_level': float         # 0-1 response confidence
    }
    
    boundaries: {
        'ethical': List[str],             # Never harm, deceive, etc.
        'functional': List[str],          # No medical advice, etc.
        'temporal': Dict[str, int],       # Session limits
        'emotional': Dict[str, float]     # Support thresholds
    }
    
    performance_metrics: {
        'response_quality': float,        # Historical quality score
        'safety_record': float,           # Safety compliance rate
        'growth_promotion': float         # User growth facilitation
    }
```

## 2. User Model

### Purpose
Comprehensive understanding of individual users including psychological profile, preferences, and relationship dynamics.

### Data Model
```python
class UserModel:
    identity: {
        'user_id': str,
        'first_seen': datetime,
        'last_interaction': datetime,
        'interaction_count': int,
        'total_time': float               # Hours of interaction
    }
    
    psychological_profile: {
        'attachment_style': AttachmentStyle,    # Secure/Anxious/Avoidant/Disorganized
        'cognitive_patterns': {
            'thinking_style': str,               # Analytical/Intuitive/Balanced
            'decision_making': str,              # Deliberative/Impulsive/Variable
            'learning_preference': str,          # Visual/Auditory/Kinesthetic
            'processing_speed': str              # Fast/Moderate/Slow
        },
        'emotional_patterns': {
            'baseline_mood': float,              # -1 to 1
            'emotional_variability': float,      # 0 to 1
            'regulation_capability': float,      # 0 to 1
            'support_needs': float               # 0 to 1
        },
        'personality_indicators': {
            'openness': float,                   # Big Five scores
            'conscientiousness': float,
            'extraversion': float,
            'agreeableness': float,
            'neuroticism': float
        }
    }
    
    capabilities: {
        'expertise_areas': Dict[str, float],    # Domain -> expertise level
        'skill_levels': Dict[str, float],       # Skill -> proficiency
        'growth_areas': List[str],              # Areas actively developing
        'strengths': List[str],                 # Identified strengths
        'challenges': List[str]                 # Identified challenges
    }
    
    preferences: {
        'communication_style': {
            'formality': str,                    # Formal/Casual/Adaptive
            'detail_level': str,                 # Concise/Detailed/Variable
            'pace': str,                         # Fast/Moderate/Slow
            'interaction_mode': str              # Questioning/Explaining/Discussing
        },
        'content_preferences': {
            'topics_enjoyed': Dict[str, float],  # Topic -> interest level
            'topics_avoided': List[str],         # Sensitive topics
            'formats_preferred': List[str],      # Lists/Paragraphs/Examples
            'depth_preference': str              # Surface/Moderate/Deep
        }
    }
    
    relationship_metrics: {
        'stage': str,                           # Initial/Establishing/Productive/Mature
        'health_score': float,                  # 0-1 relationship health
        'dependency_indicators': {
            'frequency_score': float,           # Session frequency concern
            'duration_score': float,            # Session length concern
            'emotional_reliance': float,        # Emotional dependency level
            'decision_delegation': float,       # Autonomy concern level
            'isolation_risk': float             # Social isolation indicator
        },
        'growth_trajectory': {
            'skill_development': float,         # Rate of capability growth
            'autonomy_trend': str,              # Increasing/Stable/Decreasing
            'curiosity_engagement': float       # Engagement with learning
        }
    }
    
    safety_profile: {
        'risk_level': str,                      # Low/Moderate/High
        'crisis_history': List[Dict],          # Past crisis events
        'intervention_history': List[Dict],    # Past interventions
        'triggers': List[str],                 # Known sensitive triggers
        'support_resources': List[str]         # Available support systems
    }
```

## 3. Domain Model

### Purpose
Understanding of different knowledge domains, their requirements, constraints, and appropriate interaction strategies.

### Data Model
```python
class DomainModel:
    domain_id: str                              # Unique identifier
    
    characteristics: {
        'field': str,                           # Technical/Creative/Personal/Academic
        'precision_required': float,            # 0-1 accuracy requirement
        'verification_needed': bool,            # Requires fact-checking
        'subjectivity_level': float,           # 0-1 objective to subjective
        'expertise_required': float,           # 0-1 expertise level needed
        'risk_level': str                      # Low/Medium/High stakes
    }
    
    interaction_rules: {
        'exploration_encouraged': bool,         # Can explore freely
        'creativity_appropriate': bool,         # Creative responses OK
        'speculation_allowed': bool,           # Can speculate
        'authority_level': str,                # Expert/Peer/Learner
        'error_tolerance': float               # 0-1 mistake tolerance
    }
    
    safety_constraints: {
        'professional_boundaries': List[str],   # Required boundaries
        'ethical_considerations': List[str],    # Ethical constraints
        'legal_limitations': List[str],        # Legal constraints
        'referral_triggers': Dict[str, str]    # When to refer to professionals
    }
    
    response_strategies: {
        'preferred_format': str,                # Structured/Narrative/Interactive
        'evidence_requirements': str,           # None/Moderate/Strict
        'confidence_expression': str,           # Certain/Qualified/Tentative
        'language_register': str               # Technical/Accessible/Simple
    }
    
    knowledge_structure: {
        'core_concepts': List[str],            # Fundamental concepts
        'relationships': Dict[str, List[str]], # Concept relationships
        'prerequisites': Dict[str, List[str]], # Learning dependencies
        'common_misconceptions': List[Dict]    # Typical errors to address
    }
```

## 4. Conversation Model

### Purpose
Maintains understanding of the current conversation context, goals, and dynamics.

### Data Model
```python
class ConversationModel:
    session_id: str
    
    context: {
        'start_time': datetime,
        'duration': float,                      # Minutes
        'turn_count': int,
        'topic_trajectory': List[str],         # Topic evolution
        'goal': str,                           # Identified conversation goal
        'mode': str                            # Informational/Supportive/Exploratory
    }
    
    dynamics: {
        'emotional_trajectory': List[float],    # Emotional valence over time
        'engagement_level': float,              # Current engagement 0-1
        'rapport_score': float,                # Conversation rapport 0-1
        'tension_indicators': List[str],       # Detected tensions
        'breakthrough_moments': List[Dict]     # Significant insights
    }
    
    linguistic_patterns: {
        'user_vocabulary_level': str,          # Simple/Moderate/Advanced
        'user_sentence_complexity': float,     # Avg complexity score
        'assistant_adaptation': Dict,          # Style adaptations made
        'successful_patterns': List[str],      # What's working well
        'failed_patterns': List[str]           # What's not working
    }
    
    safety_monitoring: {
        'risk_assessments': List[Dict],        # Ongoing risk checks
        'intervention_points': List[Dict],     # Where interventions occurred
        'boundary_tests': List[str],           # Boundary testing attempts
        'escalation_risk': float              # Current escalation risk 0-1
    }
```

## 5. Relationship Model

### Purpose
Tracks the evolving relationship between user and assistant over time.

### Data Model
```python
class RelationshipModel:
    user_id: str
    
    history: {
        'first_interaction': datetime,
        'total_interactions': int,
        'total_duration': float,                # Total hours
        'significant_events': List[Dict],      # Milestone moments
        'relationship_breaks': List[Dict]      # Pauses or resets
    }
    
    trust_metrics: {
        'trust_level': float,                   # 0-1 trust score
        'consistency_score': float,             # Response consistency
        'reliability_score': float,             # Meeting expectations
        'transparency_score': float,            # Honesty/openness
        'boundary_respect': float              # Boundary maintenance
    }
    
    collaboration_patterns: {
        'common_topics': List[str],            # Frequently discussed
        'successful_interactions': List[Dict],  # What works well
        'challenging_areas': List[str],        # Difficulty areas
        'growth_projects': List[Dict],         # Ongoing learning
        'shared_interests': List[str]          # Mutual curiosities
    }
    
    evolution_tracking: {
        'relationship_phase': str,              # Current phase
        'phase_transitions': List[Dict],       # Phase changes
        'health_trajectory': str,              # Improving/Stable/Declining
        'adaptation_history': List[Dict],      # How assistant adapted
        'user_growth': Dict[str, float]       # Growth in various areas
    }
```

## Model Interactions

### Model Update Flow
```python
def update_models(interaction_event):
    # Update conversation model in real-time
    conversation_model.update(interaction_event)
    
    # Update user model with new patterns
    user_model.learn_from(interaction_event)
    
    # Update relationship model
    relationship_model.evolve(interaction_event, user_model)
    
    # Self model reflects on performance
    self_model.evaluate_interaction(interaction_event)
    
    # Domain model refines understanding
    domain_model.refine(interaction_event.domain)
```

### Model Query Flow
```python
def query_models(request):
    # Get user understanding
    user_context = user_model.get_current_state()
    
    # Get relationship context
    relationship_context = relationship_model.get_dynamics()
    
    # Get domain requirements
    domain_requirements = domain_model.get_constraints(request.domain)
    
    # Self-assessment
    self_capabilities = self_model.assess_capability(request)
    
    # Synthesize understanding
    return synthesize_context(user_context, relationship_context, 
                             domain_requirements, self_capabilities)
```