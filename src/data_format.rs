use chrono::{DateTime, Utc};
use nalgebra::Vector2;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use uuid::Uuid;

pub type TaskId = Uuid;
pub type ProjectId = Uuid;

#[derive(Clone, PartialEq, Serialize, Deserialize, Debug, Default)]
pub struct Collection {
    pub tasks: Vec<Task>,
    pub projects: Vec<Project>,
}

#[derive(Clone, PartialEq, Serialize, Deserialize, Debug, Default)]
pub struct Task {
    pub id: TaskId,

    pub short_name: String,
    pub long_name: String,
    pub description: String,

    pub location: Vector2<f64>,
    pub parent: Option<ProjectId>,
    pub relationships: Vec<TaskRelationship>,

    pub status: TaskStatus,
    pub work_types: HashSet<WorkType>,
    pub activity_history: Vec<DateTime<Utc>>,
}

#[derive(Clone, PartialEq, Serialize, Deserialize, Debug, Default)]
pub struct Project {
    pub id: ProjectId,
    pub name: String,
    pub parent: Option<ProjectId>,
}

#[derive(Copy, Clone, PartialEq, Eq, Hash, Serialize, Deserialize, Debug)]
pub enum TaskStatus {
    NotStarted,
    InProgress,
    PartiallyCompleted,
    Completed,
    GotStuck,
    Obviated,
}

impl Default for TaskStatus {
    fn default() -> Self {
        TaskStatus::NotStarted
    }
}

#[derive(Copy, Clone, PartialEq, Eq, Hash, Serialize, Deserialize, Debug)]
pub enum WorkType {
    InternetResearch,
    SystemsDesign,
    CodeDesign,
    CodeGruntWork,
    StoryBrainstorming,
    ProseWriting,
}

#[derive(Clone, PartialEq, Serialize, Deserialize, Debug)]
pub struct TaskRelationship {
    pub target: TaskId,
    pub kind: TaskRelationshipKind,
}

#[derive(Copy, Clone, PartialEq, Eq, Hash, Serialize, Deserialize, Debug)]
pub enum TaskRelationshipKind {
    Dependency,
    OptionalDependency,
}
