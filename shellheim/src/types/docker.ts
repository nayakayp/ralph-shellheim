// Docker container types

export interface Container {
  id: string;
  name: string;
  image: string;
  status: string;
  state: string;
  ports: string;
  created: string;
}

export interface ContainerStats {
  container_id: string;
  name: string;
  cpu_percent: number;
  memory_usage: string;
  memory_limit: string;
  memory_percent: number;
  net_io: string;
  block_io: string;
}

export interface DockerImage {
  id: string;
  repository: string;
  tag: string;
  size: string;
  created: string;
}
